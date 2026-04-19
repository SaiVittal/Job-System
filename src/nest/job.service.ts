import { Injectable, Logger } from '@nestjs/common';
import { QueueClient } from '../core/queue/queue.client';

@Injectable()
export class JobQueueService {
  private queueClient: QueueClient;
  private readonly logger = new Logger(JobQueueService.name);

  constructor() {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = process.env.REDIS_PORT || '6379';
    // ioredis format: redis://[username:password@]host:port[/db]
    const redisUrl = `redis://${redisHost}:${redisPort}`;
    
    this.queueClient = new QueueClient(redisUrl);
    this.logger.log('JobService initialized');
  }

  async dispatchJob(jobId: number, type: string, idempotencyKey?: string) {
    this.logger.log(`Dispatching job ${jobId} (type: ${type}, key: ${idempotencyKey}) to queue`);

    const queuedJob = await this.queueClient.addJob(type, { jobId, type }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      idempotencyKey,
    });

    this.logger.log(`Job ${jobId} dispatched with BullMQ id ${queuedJob.id}`);
    return queuedJob;
  }

  /**
   * Manually re-dispatches a job by its ID.
   * Useful for retrying failed/dead jobs.
   */
  async retryJob(jobId: number, type: string, idempotencyKey?: string) {
    this.logger.log(`Manually retrying job ${jobId} (type: ${type})`, 'JobQueueService');
    // For a manual retry, we might want to bypass the old idempotency key if we want to force it
    // But here we keep the same key to ensure we don't double-queue even during manual retry
    return this.dispatchJob(jobId, type, idempotencyKey);
  }

  async getQueueLength(): Promise<number> {
    const counts = await this.queueClient.getJobCounts();
    return counts.wait + counts.active + counts.delayed;
  }

  async setHeartbeat(jobId: string | number) {
    return this.queueClient.setHeartbeat(jobId);
  }

  async getHeartbeat(jobId: string | number) {
    return this.queueClient.getHeartbeat(jobId);
  }
}
