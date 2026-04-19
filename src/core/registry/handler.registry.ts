import { JobHandler } from '../interfaces/job-handler.interface';

export class HandlerRegistry {
  private handlers = new Map<string, JobHandler>();

  register(type: string, handler: JobHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`Handler for job type "${type}" is already registered.`);
    }
    this.handlers.set(type, handler);
  }

  getHandler(type: string): JobHandler | undefined {
    return this.handlers.get(type);
  }

  getAllRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
