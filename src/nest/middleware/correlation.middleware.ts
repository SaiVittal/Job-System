import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { trace, context } from '@opentelemetry/api';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // 1. Extract or generate Correlation ID
    const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
    
    // 2. Extract current trace ID from OTel if available, or generate one
    const currentSpan = trace.getSpan(context.active());
    const traceId = currentSpan?.spanContext().traceId || uuidv4();

    // 3. Attach to request for downstream use
    req['correlationId'] = correlationId;
    req['traceId'] = traceId;

    // 4. Set headers for response
    res.setHeader('x-correlation-id', correlationId);
    res.setHeader('x-trace-id', traceId);

    next();
  }
}
