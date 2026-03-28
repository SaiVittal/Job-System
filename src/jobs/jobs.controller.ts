import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@Body() body: CreateJobDto) {
    return this.jobsService.createJob(body);
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
}
