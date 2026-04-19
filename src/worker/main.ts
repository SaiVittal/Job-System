import 'dotenv/config';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { ConsoleLogger } from '../core/logger/console-logger';
import { HandlerRegistry } from '../core/registry/handler.registry';
import { JobWorker } from '../core/worker/job-worker';
import { PrismaJobRepository } from '../infrastructure/database/prisma-job.repository';
import { EmailHandler } from './handlers/email.handler';
import { NotificationHandler } from './handlers/notification.handler';

async function bootstrap() {
  const logger = new ConsoleLogger();
  const prisma = new PrismaClient();
  
  // 1. Initialize Repository
  const repository = new PrismaJobRepository(prisma);

  // 2. Initialize Registry & Register Handlers
  const registry = new HandlerRegistry();
  registry.register('email', new EmailHandler(logger));
  registry.register('notification', new NotificationHandler(logger));

  // 3. Setup Redis connection
  const connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    maxRetriesPerRequest: null,
  });

  // 4. Start Worker
  const concurrency = parseInt(process.env.CONCURRENCY || '5', 10);
  const worker = new JobWorker(
    'job-queue',
    registry,
    repository,
    logger,
    {
      connection,
      concurrency,
    }
  );

  logger.log(`🚀 Worker bootstrapped with concurrency ${concurrency}...`, 'Bootstrap');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.log('Shutting down worker...', 'Bootstrap');
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal error during worker bootstrap:', err);
  process.exit(1);
});