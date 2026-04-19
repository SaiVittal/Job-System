import { JobHandler } from '../../core/interfaces/job-handler.interface';
import { JobModel } from '../../core/interfaces/job.interface';
import { ILogger } from '../../core/logger/logger.interface';

export class EmailHandler implements JobHandler {
  constructor(private logger: ILogger) {}

  async handle(job: JobModel): Promise<void> {
    const { to, subject, body } = job.payload;
    
    this.logger.log(`Sending email to ${to} with subject "${subject}"...`, 'EmailHandler');
    
    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // Random failure simulation
    if (Math.random() < 0.2) {
      throw new Error('SMTP server timeout');
    }
    
    this.logger.log(`Email sent successfully to ${to}`, 'EmailHandler');
  }
}
