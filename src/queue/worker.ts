import 'dotenv/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('Worker');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});


const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'job-queue',
  async (job) => {
    const jobId = job.data.jobId;

    logger.log(`Processing job ${jobId}`);

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'processing' },
    });

    if (Math.random() < 0.3) {
      throw new Error('Random failure!');
    }

    await new Promise((r) => setTimeout(r, 3000));

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'completed' },
    });

    logger.log(`Job ${jobId} completed`);
  },
  {
    connection,
    concurrency: 5, // 1 worker → handles 5 jobs at once
  },

  
);

worker.on('failed', async (job, err) => {
  const jobId = job?.data.jobId;
  logger.error(`Job ${jobId} failed: ${err.message}`);

  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'failed' },
  });
});

logger.log('🚀 Worker started...');

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});