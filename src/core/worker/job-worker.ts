import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { ILogger } from '../logger/logger.interface';
import { HandlerRegistry } from '../registry/handler.registry';
import { IJobRepository } from '../interfaces/job.repository.interface';
import { JobStatus } from '../interfaces/job.interface';
import { withTimeout } from './worker.utils';

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

    try {
      // 1. Fetch current state from DB
      const jobModel = await this.repository.getById(jobId);
      if (!jobModel) throw new Error(`Job ${jobId} not found`);

      // 2. Idempotency Check: Skip if already completed
      if (jobModel.status === JobStatus.COMPLETED) {
        this.logger.warn(`[Job ${jobId}] Already marked as COMPLETED in DB. Skipping duplicate execution.`, 'JobWorker');
        return;
      }

      this.logger.log(`[Job ${jobId}] Processing attempt ${job.attemptsMade + 1}`, 'JobWorker');
      
      await this.repository.incrementAttempts(jobId);
      await this.repository.updateStatus(jobId, JobStatus.PROCESSING);

      const timeoutMs = this.options.jobTimeoutMs || 30000;
      await withTimeout(handler.handle(jobModel), timeoutMs);

      await this.repository.updateStatus(jobId, JobStatus.COMPLETED);
      this.logger.log(`[Job ${jobId}] Completed`, 'JobWorker');
    } catch (error: any) {
      this.logger.error(`[Job ${jobId}] Attempt failed: ${error.message}`, error.stack, 'JobWorker');
      await this.repository.updateStatus(jobId, JobStatus.FAILED, error.message);
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
