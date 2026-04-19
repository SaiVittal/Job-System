import { JobModel, JobStatus } from './job.interface';

export interface IJobRepository {
  updateStatus(id: string | number, status: JobStatus, error?: string): Promise<void>;
  incrementAttempts(id: string | number): Promise<void>;
  getById(id: string | number): Promise<JobModel | null>;
  getStats(): Promise<Record<JobStatus, number>>;
}
