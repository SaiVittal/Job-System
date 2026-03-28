import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class QueueService {
  private queue: Queue;
  private readonly logger = new Logger(QueueService.name);

  constructor() {
    const connection = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    });

    this.queue = new Queue('job-queue', { connection });
    this.logger.log('Queue service initialized');
  }

  async addJob(job: { jobId: number }) {
    this.logger.log(`Adding job ${job.jobId} to queue`);

    const queuedJob = await this.queue.add('process-job', job,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    this.logger.log(`Job ${job.jobId} added to queue with BullMQ id ${queuedJob.id}`);
    return queuedJob;
  }
}
