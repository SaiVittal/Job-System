import { JobHandler } from '../../core/interfaces/job-handler.interface';
import { JobModel } from '../../core/interfaces/job.interface';
import { ILogger } from '../../core/logger/logger.interface';

export class EmailHandler implements JobHandler {
  constructor(private logger: ILogger) {}

  async handle(job: JobModel, signal?: AbortSignal): Promise<void> {
    const { to, subject, body } = job.payload;
    
    this.logger.log(`Sending email to ${to} with subject "${subject}"...`, 'EmailHandler');
    
    // Simulate long-running work that respects the signal
    await this.sleep(2000, signal);
    
    if (signal?.aborted) {
      this.logger.warn(`Email to ${to} aborted before completion.`, 'EmailHandler');
      return;
    }

    // Random failure simulation
    if (Math.random() < 0.2) {
      throw new Error('SMTP server timeout');
    }
    
    this.logger.log(`Email sent successfully to ${to}`, 'EmailHandler');
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Handler aborted by worker timeout'));
      });
    });
  }
}
