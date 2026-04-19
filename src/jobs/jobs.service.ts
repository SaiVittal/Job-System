import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { PrismaService } from 'prisma/prisma.service';
import { JobQueueService } from '../nest/job.service';
import { PrismaJobRepository } from '../infrastructure/database/prisma-job.repository';

@Injectable()
export class JobsService {
  private repository: PrismaJobRepository;

  constructor(private prisma: PrismaService, private queueService: JobQueueService) {
    this.repository = new PrismaJobRepository(this.prisma);
  }

  async createJob(dto: CreateJobDto) {
    // 1. BACKPRESSURE: Adaptive Throttling
    const maxQueueLength = parseInt(process.env.MAX_QUEUE_LENGTH || '10000', 10);
    const currentLength = await this.queueService.getQueueLength();
    
    // Hard limit: Reject
    if (currentLength >= maxQueueLength) {
      throw new BadRequestException(`System overloaded. Queue capacity reached (${currentLength}/${maxQueueLength})`);
    }

    // Adaptive Throttling: Slow down the producer if queue > 70% full
    if (currentLength > maxQueueLength * 0.7) {
      const delayMs = Math.min((currentLength / maxQueueLength) * 1000, 2000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    try {
      const job = await this.prisma.job.create({
        data: {
          type: dto.type,
          payload: dto.payload,
          idempotencyKey: dto.idempotencyKey,
          status: 'queued',
        },
      });

      // 2. DISPATCH
      await this.queueService.dispatchJob(job.id, job.type, job.idempotencyKey || undefined);
      return job;
    } catch (error: any) {
      // 3. IDEMPOTENCY: Handle unique constraint failure (P2002)
      if (error.code === 'P2002') {
        const existing = await this.prisma.job.findUnique({
          where: { idempotencyKey: dto.idempotencyKey }
        });
        return existing; // Return existing job instead of failing
      }
      throw error;
    }
  }

  async getAllJobs() {
    return this.prisma.job.findMany();
  }

  async getJob(id: number) {
    return this.prisma.job.findUnique({
      where: { id },
    });
  }

  async getJobStatus(id: number) {
    const job = await this.prisma.job.findUnique({
      where: {id}
    });

    if(!job){
      throw new Error('Job not found');
    }

    return {
      id: job.id,
      status: job.status,
    }
  }

  async retryJob(id: number) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new Error('Job not found');

    if (job.status !== 'failed' && job.status !== 'dead') {
      throw new Error(`Job cannot be retried in its current state: ${job.status}`);
    }

    // Reset status and retry
    await this.prisma.job.update({
      where: { id },
      data: { status: 'queued', error: null }
    });

    return this.queueService.retryJob(job.id, job.type, job.idempotencyKey || undefined);
  }

  async getSystemStats() {
    return this.repository.getStats();
  }
}