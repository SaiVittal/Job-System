import { JobModel } from './job.interface';

export interface JobHandlerMetadata {
  rateLimit?: {
    points: number;   // Number of jobs
    duration: number; // In seconds
  };
  supportedVersions?: number[];
}

export interface JobHandler<T = any> {
  metadata?: JobHandlerMetadata;
  handle(job: JobModel<T>, signal?: AbortSignal): Promise<void>;
}
