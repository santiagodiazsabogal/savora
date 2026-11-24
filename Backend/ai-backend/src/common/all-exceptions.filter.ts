import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

// Filtro GLOBAL de excepciones: registra todo de forma consistente y reporta los 5xx a Sentry
// (si SENTRY_DSN está configurado). Preserva el shape de los HttpException (statusCode/message)
// para NO romper el frontend, que lee `data.message`. Solo actúa sobre contexto HTTP; en WS
// (gateways de duelos/clanes) solo loguea y deja el manejo propio del gateway.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;

    // Observabilidad: 5xx = error (con stack) + Sentry; 4xx no se reporta (ruido esperado).
    if (status >= 500) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(err.message, err.stack);
      if (process.env.SENTRY_DSN) {
        try { Sentry.captureException(exception); } catch { /* nunca romper por el reporte */ }
      }
    }

    // En contexto no-HTTP (WebSocket), no intentamos responder por HTTP (rompería el gateway).
    if (host.getType() !== 'http') return;

    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();

    // Conserva la respuesta original del HttpException (mensajes como LIMIT_REACHED,
    // errores de validación, etc.). Para errores no controlados, 500 genérico (sin filtrar detalles).
    const body = isHttp
      ? (() => {
          const r = exception.getResponse();
          return typeof r === 'string' ? { statusCode: status, message: r } : r;
        })()
      : { statusCode: 500, message: 'Internal server error' };

    res.status(status).json({ ...(body as object), path: req?.url, timestamp: new Date().toISOString() });
  }
}
