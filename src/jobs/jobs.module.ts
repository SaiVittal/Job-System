import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PrismaModule } from 'prisma/prisma.module';
import { JobModule } from '../nest/job.module';

@Module({
  controllers: [JobsController],
  providers: [JobsService],
  imports: [PrismaModule, JobModule],
})
export class JobsModule {}
