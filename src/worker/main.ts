import 'dotenv/config';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { ConsoleLogger } from '../core/logger/console-logger';
import { HandlerRegistry } from '../core/registry/handler.registry';
import { JobWorker } from '../core/worker/job-worker';
import { MetricsRegistry } from '../core/metrics/metrics.registry';
import { JobStatus } from '../core/interfaces/job.interface';
import { PrismaJobRepository } from '../infrastructure/database/prisma-job.repository';
import { EmailHandler } from './handlers/email.handler';
import { NotificationHandler } from './handlers/notification.handler';

async function bootstrap() {
  const logger = new ConsoleLogger();
  const prisma = new PrismaClient();
  
  // 1. Initialize Repository
  const repository = new PrismaJobRepository(prisma);

  // 2. Initialize Registry & Metrics
  const registry = new HandlerRegistry();
  const metrics = new MetricsRegistry();
  
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
    metrics,
    {
      connection,
      concurrency,
    }
  );

  logger.log(`🚀 Worker bootstrapped with concurrency ${concurrency}...`, 'Bootstrap');

  // 5. Start Status Reconciliation (Eventual Consistency + Heartbeat)
  const reconciliationInterval = setInterval(async () => {
    logger.log('Running status reconciliation...', 'Reconciliation');
    
    // Fetch jobs that haven't been updated in 1 minute
    const stuckJobs = await repository.getStuckJobs(1); 
    
    for (const job of stuckJobs) {
      const heartbeat = await connection.get(`job-heartbeat:${job.id}`);
      if (!heartbeat) {
        logger.warn(`Job ${job.id} has no heartbeat. Recovering...`, 'Reconciliation');
        await repository.updateStatus(job.id, JobStatus.FAILED, 'RECOVERY: Heartbeat lost (Process likely crashed)');
      }
    }
  }, 30 * 1000); // Check every 30 seconds

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.log('Shutting down worker...', 'Bootstrap');
    clearInterval(reconciliationInterval);
    
    // Dump final metrics
    const finalMetrics = metrics.getMetrics();
    logger.log('Final Worker Metrics', 'Metrics', finalMetrics);

    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal error during worker bootstrap:', err);
  process.exit(1);
});