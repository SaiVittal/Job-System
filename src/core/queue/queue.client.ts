import { Queue, JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import { QueueJobOptions } from './queue.types';

export class QueueClient {
  private queue: Queue;

  constructor(redisUrl: string, queueName: string = 'job-queue') {
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(queueName, { connection });
  }

  async addJob(name: string, data: any, options: QueueJobOptions = {}) {
    const bullOptions: JobsOptions = {
      attempts: options.attempts || 3,
      backoff: options.backoff || {
        type: 'exponential',
        delay: 2000,
      },
      // Idempotency: mapping idempotencyKey to BullMQ's native jobId
      jobId: options.idempotencyKey,
      removeOnComplete: options.removeOnComplete ?? true,
      removeOnFail: options.removeOnFail ?? false,
    };

    return this.queue.add(name, data, bullOptions);
  }

  async close() {
    await this.queue.close();
  }
}
