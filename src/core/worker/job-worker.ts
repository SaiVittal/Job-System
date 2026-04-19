import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { ILogger } from '../logger/logger.interface';
import { HandlerRegistry } from '../registry/handler.registry';
import { IJobRepository } from '../interfaces/job.repository.interface';
import { JobStatus } from '../interfaces/job.interface';
import { withTimeout } from './worker.utils';
import { MetricsRegistry } from '../metrics/metrics.registry';

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

    const startTime = Date.now();
    try {
      // 1. Fetch current state from DB
      const jobModel = await this.repository.getById(jobId);
      if (!jobModel) throw new Error(`Job ${jobId} not found`);

      // 2. Idempotency & Poison Pill Check
      if (jobModel.status === JobStatus.COMPLETED) {
        this.logger.warn(`[Job ${jobId}] Already marked as COMPLETED in DB. Skipping duplicate execution.`, 'JobWorker', { jobId, type });
        return;
      }

      if (jobModel.attempts >= jobModel.maxAttempts) {
        this.logger.error(`[Job ${jobId}] Poison Pill Detected: Job has already reached max attempts (${jobModel.attempts}). Moving to DEAD.`, undefined, 'JobWorker', { jobId, type, attempts: jobModel.attempts });
        await this.repository.updateStatus(jobId, JobStatus.DEAD, 'Poison Pill: Max attempts reached in DB');
        this.metrics.increment('jobs_poison_pill_total', { type });
        return;
      }

      this.logger.log(`[Job ${jobId}] Processing attempt ${job.attemptsMade + 1}`, 'JobWorker', { jobId, type, attempt: job.attemptsMade + 1 });
      
      // Combine multiple DB writes into ONE atomic operation (High Load optimization)
      await this.repository.startProcessing(jobId);

      const timeoutMs = this.options.jobTimeoutMs || 30000;
      const controller = new AbortController();

      // 3. Start Heartbeat (Transient state in Redis to avoid DB load)
      const heartbeatInterval = setInterval(async () => {
        const key = `job-heartbeat:${jobId}`;
        await this.options.connection.set(key, Date.now().toString(), 'EX', 30);
      }, 10000); // Every 10 seconds

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

      const duration = Date.now() - startTime;
      await this.repository.updateStatus(jobId, JobStatus.COMPLETED);
      
      this.logger.log(`[Job ${jobId}] Completed`, 'JobWorker', { jobId, type, duration });
      this.metrics.increment('jobs_processed_total', { type, status: 'success' });
      this.metrics.observe('job_duration_ms', duration, { type });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[Job ${jobId}] Attempt failed: ${error.message}`, error.stack, 'JobWorker', { jobId, type, duration });
      await this.repository.updateStatus(jobId, JobStatus.FAILED, error.message);
      
      this.metrics.increment('jobs_processed_total', { type, status: 'failed' });
      throw error; 
    }
  }

  private setupListeners() {
    this.worker.on('failed', async (job, err) => {
      if (job) {
        const { jobId } = job.data;
        if (job.attemptsMade >= (job.opts.attempts || 1)) {
           this.logger.error(`[Job ${jobId}] Permanent failure`, err.stack, 'JobWorker');
           await this.repository.updateStatus(jobId, JobStatus.DEAD, `DEAD: ${err.message}`);
        }
      }
    });
  }

  async close() {
    await this.worker.close();
  }
}
