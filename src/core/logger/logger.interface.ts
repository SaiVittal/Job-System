export interface ILogger {
  log(message: string, context?: string, extra?: any): void;
  error(message: string, trace?: string, context?: string, extra?: any): void;
  warn(message: string, context?: string, extra?: any): void;
  debug(message: string, context?: string, extra?: any): void;
}
