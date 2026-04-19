import { JobWorker } from './job-worker';
import { HandlerRegistry } from '../registry/handler.registry';
import { IJobRepository } from '../interfaces/job.repository.interface';
import { JobStatus } from '../interfaces/job.interface';
import { ILogger } from '../logger/logger.interface';
import { MetricsRegistry } from '../metrics/metrics.registry';
import { Job } from 'bullmq';

describe('JobWorker', () => {
  let worker: JobWorker;
  let registry: HandlerRegistry;
  let repository: jest.Mocked<IJobRepository>;
  let logger: jest.Mocked<ILogger>;
  let metrics: jest.Mocked<MetricsRegistry>;
  let mockConnection: any;

  beforeEach(() => {
    registry = new HandlerRegistry();
    repository = {
      getById: jest.fn(),
      updateStatus: jest.fn(),
      startProcessing: jest.fn(),
      getStats: jest.fn(),
      recoverStuckJobs: jest.fn(),
      getStuckJobs: jest.fn(),
    } as any;
    
    logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    metrics = {
      increment: jest.fn(),
      observe: jest.fn(),
      getMetrics: jest.fn(),
    } as any;

    mockConnection = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    // Register a dummy handler so processJob doesn't fail fast
    registry.register('email', { handle: jest.fn() });

    worker = new JobWorker(
      'test-queue',
      registry,
      repository,
      logger,
      metrics,
      { connection: mockConnection }
    );
  });

  it('should skip execution if job is already COMPLETED (Idempotency)', async () => {
    const jobData = { jobId: '123', type: 'email' };
    const jobModel = { id: '123', status: JobStatus.COMPLETED } as any;
    
    repository.getById.mockResolvedValue(jobModel);
    
    // Trigger the private processJob via casting to any
    await (worker as any).processJob({ data: jobData, attemptsMade: 0 } as Job);

    expect(repository.startProcessing).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Already marked as COMPLETED'),
      expect.any(String),
      expect.any(Object)
    );
  });

  it('should move job to DEAD if max attempts reached (Poison Pill)', async () => {
    const jobData = { jobId: '123', type: 'email' };
    const jobModel = { id: '123', status: JobStatus.QUEUED, attempts: 3, maxAttempts: 3 } as any;
    
    repository.getById.mockResolvedValue(jobModel);
    
    await (worker as any).processJob({ data: jobData, attemptsMade: 2 } as Job);

    expect(repository.updateStatus).toHaveBeenCalledWith('123', JobStatus.DEAD, expect.any(String));
    expect(metrics.increment).toHaveBeenCalledWith('jobs_poison_pill_total', expect.any(Object));
  });

  it('should abort handler if timeout occurs (Zombie Handler)', async () => {
    const jobData = { jobId: '123', type: 'slow-job' };
    const jobModel = { id: '123', status: JobStatus.QUEUED, attempts: 0, maxAttempts: 3 } as any;
    
    const slowHandler = {
      handle: jest.fn().mockImplementation(async (job, signal) => {
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        });
      }),
    };

    registry.register('slow-job', slowHandler);
    repository.getById.mockResolvedValue(jobModel);

    // Set a very short timeout for the test
    (worker as any).options.jobTimeoutMs = 10;

    await expect((worker as any).processJob({ data: jobData, attemptsMade: 0 } as Job))
      .rejects.toThrow('Operation timed out');

    expect(repository.updateStatus).toHaveBeenCalledWith('123', JobStatus.FAILED, 'Operation timed out');
  });
});
