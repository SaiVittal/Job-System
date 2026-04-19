import { ILogger } from './logger.interface';

export class ConsoleLogger implements ILogger {
  private format(level: string, message: string, context?: string, extra?: any): string {
    const logObject = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      ...extra,
    };
    return JSON.stringify(logObject);
  }

  log(message: string, context?: string, extra?: any): void {
    console.log(this.format('INFO', message, context, extra));
  }

  error(message: string, trace?: string, context?: string, extra?: any): void {
    console.error(this.format('ERROR', message, context, { trace, ...extra }));
  }

  warn(message: string, context?: string, extra?: any): void {
    console.warn(this.format('WARN', message, context, extra));
  }

  debug(message: string, context?: string, extra?: any): void {
    console.debug(this.format('DEBUG', message, context, extra));
  }
}
