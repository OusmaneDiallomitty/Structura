import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  Logger,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

/**
 * Capture toutes les exceptions non gérées (hors HttpException).
 * Garantit qu'aucune erreur inattendue ne passe silencieusement.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // Laisser HttpExceptionFilter gérer les HttpException
    if (exception instanceof HttpException) return;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    this.logger.error(
      `Unhandled exception — ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    Sentry.captureException(exception, {
      extra: { url: request.url, method: request.method },
    });

    response.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
    });
  }
}
