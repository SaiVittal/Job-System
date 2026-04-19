import { ILogger } from './logger.interface';

export class ConsoleLogger implements ILogger {
  log(message: string, context?: string): void {
    console.log(`[LOG]${context ? ` [${context}]` : ''} ${message}`);
  }

  error(message: string, trace?: string, context?: string): void {
    console.error(`[ERROR]${context ? ` [${context}]` : ''} ${message}${trace ? `\n${trace}` : ''}`);
  }

  warn(message: string, context?: string): void {
    console.warn(`[WARN]${context ? ` [${context}]` : ''} ${message}`);
  }

  debug(message: string, context?: string): void {
    console.debug(`[DEBUG]${context ? ` [${context}]` : ''} ${message}`);
  }
}
