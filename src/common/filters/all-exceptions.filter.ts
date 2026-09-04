import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiV1Exception } from '../exceptions/api-v1.exception';
import { apiV1Error } from '../contracts/api-v1.contract';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse<Response>();

    const originalUrl: string = request?.originalUrl || '';
    const requestId: string = request?.requestId || '';
    const isV1 = originalUrl.startsWith('/api/v1/');

    if (isV1) {
      this.handleV1(exception, response, requestId);
      return;
    }

    // Legacy error handling — unchanged
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message = typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || exception.message;
      const code = typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as any).code
        : undefined;

      response.status(status).json({
        success: false,
        ...(code ? { code } : {}),
        message,
      });
      return;
    }

    console.error('Unhandled exception:', exception);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '服务器内部错误',
    });
  }

  private handleV1(exception: unknown, response: Response, requestId: string): void {
    if (exception instanceof ApiV1Exception) {
      response.status(exception.getStatus()).json(
        apiV1Error(exception.code, exception.message, exception.retryable, exception.details, requestId),
      );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message = typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || exception.message;

      const isValidation = status === HttpStatus.BAD_REQUEST;
      const code = isValidation ? 'VALIDATION_FAILED' : 'HTTP_ERROR';
      const retryable = status === HttpStatus.TOO_MANY_REQUESTS || status >= 500;

      const details: unknown[] = [];
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as any;
        if (Array.isArray(resp.message)) {
          details.push(...resp.message);
        }
      }

      response.status(status).json(
        apiV1Error(code, typeof message === 'string' ? message : String(message), retryable, details, requestId),
      );
      return;
    }

    console.error('Unhandled V1 exception:', exception);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      apiV1Error('INTERNAL_ERROR', '服务器内部错误', true, [], requestId),
    );
  }
}
