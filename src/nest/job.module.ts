import { Global, Module } from '@nestjs/common';
import { JobQueueService } from './job.service';

@Global()
@Module({
  providers: [JobQueueService],
  exports: [JobQueueService],
})
export class JobModule {}
