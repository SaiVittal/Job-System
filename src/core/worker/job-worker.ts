import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { ILogger } from '../logger/logger.interface';
import { HandlerRegistry } from '../registry/handler.registry';
import { IJobRepository } from '../interfaces/job.repository.interface';
import { JobStatus } from '../interfaces/job.interface';
import { withTimeout } from './worker.utils';
import { MetricsRegistry } from '../metrics/metrics.registry';
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';

const tracer = trace.getTracer('job-worker');

export interface WorkerOptions {
  connection: Redis;
  concurrency?: number;
  jobTimeoutMs?: number;
}

export class JobWorker {
  private worker: Worker;

  constructor(
    private queueName: string,
    private registry: HandlerRegistry,
    private repository: IJobRepository,
    private logger: ILogger,
    private metrics: MetricsRegistry,
    private options: WorkerOptions
  ) {
    this.worker = new Worker(
      this.queueName,
      async (job: Job) => this.processJob(job),
      {
        connection: options.connection,
        concurrency: options.concurrency || 1,
      }
    );

    this.setupListeners();
  }

  private async processJob(job: Job) {
    const { jobId, type } = job.data;
    const handler = this.registry.getHandler(type);

    if (!handler) {
      const errorMsg = `No handler found for job type: ${type}`;
      await this.repository.updateStatus(jobId, JobStatus.FAILED, errorMsg);
      throw new Error(errorMsg);
    }

    return tracer.startActiveSpan(
      `Job ${type}`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'job.id': jobId,
          'job.type': type,
          'job.attempt': job.attemptsMade + 1,
        },
      },
      async (span) => {
        const startTime = Date.now();
        try {
          // 1. Fetch current state from DB
          const jobModel = await this.repository.getById(jobId);
          if (!jobModel) throw new Error(`Job ${jobId} not found`);

          if (jobModel.traceId) span.setAttribute('job.traceId', jobModel.traceId);
          if (jobModel.correlationId) span.setAttribute('job.correlationId', jobModel.correlationId);

          // 2. Rate Limiting Check
          if (handler.metadata?.rateLimit) {
            const { points, duration } = handler.metadata.rateLimit;
            const rateKey = `rate-limit:${type}`;
            const current = await this.options.connection.incr(rateKey);
            if (current === 1) await this.options.connection.expire(rateKey, duration);
            
            if (current > points) {
              span.addEvent('rate_limit_exceeded');
              this.logger.warn(`[Job ${jobId}] Rate limit exceeded for ${type}`, 'JobWorker');
              await job.moveToDelayed(Date.now() + (duration * 1000), job.token);
              throw new Error(`Rate limit exceeded for ${type}`);
            }
          }

          // 3. Versioning Check
          if (handler.metadata?.supportedVersions && !handler.metadata.supportedVersions.includes(jobModel.version)) {
            const errorMsg = `Job version ${jobModel.version} not supported by handler ${type}`;
            throw new Error(errorMsg);
          }

          // 4. Idempotency & Poison Pill Check
          if (jobModel.status === JobStatus.COMPLETED) {
            this.logger.warn(`[Job ${jobId}] Already COMPLETED. Skipping.`, 'JobWorker');
            return;
          }

          if (jobModel.attempts >= jobModel.maxAttempts) {
            await this.repository.updateStatus(jobId, JobStatus.DEAD, 'Poison Pill: Max attempts reached');
            this.metrics.increment('jobs_poison_pill_total', { type });
            return;
          }

          await this.repository.startProcessing(jobId);

          const timeoutMs = this.options.jobTimeoutMs || 30000;
          const controller = new AbortController();

          const heartbeatInterval = setInterval(async () => {
            const key = `job-heartbeat:${jobId}`;
            await this.options.connection.set(key, Date.now().toString(), 'EX', 30);
          }, 10000);

          try {
            await withTimeout(
              (signal) => handler.handle(jobModel, signal),
              timeoutMs,
              controller
            );
          } finally {
            clearInterval(heartbeatInterval);
            await this.options.connection.del(`job-heartbeat:${jobId}`);
          }

          const durationMs = Date.now() - startTime;
          await this.repository.updateStatus(jobId, JobStatus.COMPLETED);
          
          this.logger.log(`[Job ${jobId}] Completed in ${durationMs}ms`, 'JobWorker');
          this.metrics.increment('jobs_processed_total', { type, status: 'success' });
          this.metrics.observe('job_duration_ms', durationMs, { type });
          span.setStatus({ code: SpanStatusCode.OK });

        } catch (error: any) {
          const durationMs = Date.now() - startTime;
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          
          this.logger.error(`[Job ${jobId}] Failed: ${error.message}`, error.stack, 'JobWorker');
          await this.repository.updateStatus(jobId, JobStatus.FAILED, error.message);
          
          this.metrics.increment('jobs_processed_total', { type, status: 'failed' });
          throw error; 
        } finally {
          span.end();
        }
      }
    );
  }

  private setupListeners() {
    this.worker.on('failed', async (job, err) => {
      if (job) {
        const { jobId } = job.data;
        if (job.attemptsMade >= (job.opts.attempts || 1)) {
           await this.repository.updateStatus(jobId, JobStatus.DEAD, `DEAD: ${err.message}`);
        }
      }
    });
  }

  async close() {
    await this.worker.close();
  }
}
