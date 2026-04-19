import { JobHandler } from '../../core/interfaces/job-handler.interface';
import { JobModel } from '../../core/interfaces/job.interface';
import { ILogger } from '../../core/logger/logger.interface';

export class NotificationHandler implements JobHandler {
  constructor(private logger: ILogger) {}

  async handle(job: JobModel, signal?: AbortSignal): Promise<void> {
    const { userId, message, platform } = job.payload;
    
    this.logger.log(`[Notification] Sending ${platform} push to user ${userId}: "${message}"`, 'NotificationHandler');
    
    // Simulate API call to Firebase/OneSignal
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    this.logger.log(`[Notification] Successfully sent to user ${userId}`, 'NotificationHandler');
  }
}
