import { JobModel } from './job.interface';

export interface JobHandler<T = any> {
  handle(job: JobModel<T>, signal?: AbortSignal): Promise<void>;
}
