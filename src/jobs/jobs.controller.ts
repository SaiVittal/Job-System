import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';
import { Request } from 'express';

@Controller('jobs')
export class JobsController {
constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@Body() body: CreateJobDto, @Req() req: any) {
    const traceInfo = {
      traceId: req['traceId'],
      correlationId: req['correlationId'],
    };
    return this.jobsService.createJob(body, traceInfo);
  }

  @Get('stats')
  async getStats() {
    return this.jobsService.getSystemStats();
  }

  @Get()
  findAll() {
    return this.jobsService.getAllJobs();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobsService.getJob(Number(id));
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.jobsService.getJobStatus(Number(id));
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.jobsService.retryJob(Number(id));
  }
}
