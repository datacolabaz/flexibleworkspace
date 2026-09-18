import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter implementing the consistent error envelope fixed
 * in 11_API_CONTRACTS.md §11.2:
 *   { "error": { "code": "...", "message": "...", "details": {...} } }
 *
 * Never leaks a raw stack trace or internal error message to the client
 * (18_SECURITY.md) — unexpected errors are logged server-side with full
 * detail and returned to the client as a generic INTERNAL_ERROR.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // DomainException (and its subclasses) already produce { code, message, details }
      if (typeof body === 'object' && body !== null && 'code' in body) {
        const { code, message, details } = body as {
          code: string;
          message: string;
          details?: unknown;
        };
        response.status(status).json({ error: { code, message, details } });
        return;
      }

      // Standard Nest HttpException (e.g. class-validator ValidationPipe failures)
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as any).message
          : exception.message;
      response.status(status).json({
        error: {
          code: this.statusToCode(status),
          message: Array.isArray(message) ? message.join('; ') : message,
        },
      });
      return;
    }

    // Unexpected/unhandled error — log full detail server-side, return nothing sensitive to the client
    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}: ${(exception as Error)?.message}`,
      (exception as Error)?.stack,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again.',
      },
    });
  }

  private statusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'ERROR';
    }
  }
}
