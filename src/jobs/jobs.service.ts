import { Injectable } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { PrismaService } from 'prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService, private queueService: QueueService) {}

  async createJob(dto: CreateJobDto) {
    const job = await this.prisma.job.create({
      data: {
        ...dto,
        status: 'pending',
      },
    });

    // push the job to the queue
    await this.queueService.addJob(
      {
        jobId: job.id
      }
    );
    return job;

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
}