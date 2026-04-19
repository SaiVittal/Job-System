import { PrismaClient } from '@prisma/client';
import { IJobRepository } from '../../core/interfaces/job.repository.interface';
import { JobModel, JobStatus } from '../../core/interfaces/job.interface';

export class PrismaJobRepository implements IJobRepository {
  constructor(private prisma: PrismaClient) {}

  async updateStatus(id: string | number, status: JobStatus, error?: string): Promise<void> {
    await this.prisma.job.update({
      where: { id: Number(id) },
      data: { 
        status,
        error: error || null
      },
    });
  }

  async startProcessing(id: string | number): Promise<void> {
    await this.prisma.job.update({
      where: { id: Number(id) },
      data: { 
        status: JobStatus.PROCESSING,
        attempts: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }

  async recoverStuckJobs(timeoutMinutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60000);
    
    const result = await this.prisma.job.updateMany({
      where: {
        status: JobStatus.PROCESSING,
        updatedAt: { lt: cutoff },
      },
      data: {
        status: JobStatus.FAILED,
        error: 'RECOVERY: Job stuck in processing for too long.',
      },
    });

    return result.count;
  }

  async getStuckJobs(timeoutMinutes: number): Promise<JobModel[]> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60000);
    
    const jobs = await this.prisma.job.findMany({
      where: {
        status: JobStatus.PROCESSING,
        updatedAt: { lt: cutoff },
      },
    });

    return jobs.map(job => ({
      id: job.id,
      type: job.type,
      payload: job.payload,
      status: job.status as JobStatus,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      idempotencyKey: job.idempotencyKey || undefined,
      error: job.error || undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }));
  }

  async getById(id: string | number): Promise<JobModel | null> {
    const job = await this.prisma.job.findUnique({
      where: { id: Number(id) },
    });

    if (!job) return null;

    return {
      id: job.id,
      type: job.type,
      payload: job.payload,
      status: job.status as JobStatus,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      idempotencyKey: job.idempotencyKey || undefined,
      error: job.error || undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async getStats(): Promise<Record<JobStatus, number>> {
    const stats = await this.prisma.job.groupBy({
      by: ['status'],
      _count: {
        _all: true,
      },
    });

    const result: Record<string, number> = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retrying: 0,
      dead: 0,
    };

    stats.forEach((stat) => {
      result[stat.status] = stat._count._all;
    });

    return result as Record<JobStatus, number>;
  }
}
