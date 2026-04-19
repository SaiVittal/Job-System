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
      priority: options.priority,
      delay: options.delay,
    };

    return this.queue.add(name, data, bullOptions);
  }

  async getJobCounts() {
    return this.queue.getJobCounts('wait', 'active', 'delayed', 'completed', 'failed');
  }

  async setHeartbeat(jobId: string | number, timeoutSeconds: number = 30): Promise<void> {
    const key = `job-heartbeat:${jobId}`;
    const client = await this.queue.client;
    await client.set(key, Date.now().toString(), 'EX', timeoutSeconds);
  }

  async getHeartbeat(jobId: string | number): Promise<string | null> {
    const client = await this.queue.client;
    return client.get(`job-heartbeat:${jobId}`);
  }

  async close() {
    await this.queue.close();
  }
}
