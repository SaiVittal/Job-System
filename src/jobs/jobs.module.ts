import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PrismaModule } from 'prisma/prisma.module';
import { QueueModule } from 'src/queue/queue.module';

@Module({
  controllers: [JobsController],
  providers: [JobsService],
  imports: [PrismaModule, QueueModule],
})
export class JobsModule {}
