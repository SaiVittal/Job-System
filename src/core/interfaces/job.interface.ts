export enum JobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
  DEAD = 'dead',
}

export interface JobModel<T = any> {
  id: string | number;
  type: string;
  payload: T;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string;
  error?: string;
  traceId?: string;
  correlationId?: string;
  priority?: number;
  version: number;
  scheduledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
