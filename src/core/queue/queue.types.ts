export interface BackoffOptions {
  type: 'fixed' | 'exponential';
  delay: number;
}

export interface QueueJobOptions {
  attempts?: number;
  backoff?: BackoffOptions;
  idempotencyKey?: string;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}
