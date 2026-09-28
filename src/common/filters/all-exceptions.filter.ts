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
        ...(typeof exceptionResponse === 'object' && exceptionResponse !== null && (exceptionResponse as any).existing_resource
          ? { existing_resource: (exceptionResponse as any).existing_resource } : {}),
        ...(typeof exceptionResponse === 'object' && exceptionResponse !== null && (exceptionResponse as any).existing_resources
          ? { existing_resources: (exceptionResponse as any).existing_resources } : {}),
        ...(code === 'CHALLENGE_REQUIRED' && typeof exceptionResponse === 'object' && exceptionResponse !== null && (exceptionResponse as any).details
          ? { details: (exceptionResponse as any).details } : {}),
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
      const structured = typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? exceptionResponse as Record<string, any>
        : {};
      const inferredCode = status === HttpStatus.TOO_MANY_REQUESTS ? 'RATE_LIMITED'
        : status === HttpStatus.PAYLOAD_TOO_LARGE ? 'UPLOAD_TOO_LARGE'
        : status === HttpStatus.NOT_FOUND ? 'RESOURCE_NOT_FOUND'
        : isValidation ? 'VALIDATION_FAILED' : 'HTTP_ERROR';
      const code = typeof structured.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(structured.code)
        ? structured.code
        : inferredCode;
      const retryable = typeof structured.retryable === 'boolean'
        ? structured.retryable
        : status === HttpStatus.TOO_MANY_REQUESTS || status >= 500;

      const details: unknown[] = [];
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        if (Array.isArray(structured.message)) {
          details.push(...structured.message);
        } else if (Array.isArray(structured.details)) {
          details.push(...structured.details);
        }
      }

      const errorBody = apiV1Error(code, typeof message === 'string' ? message : String(message), retryable, details, requestId);
      if (structured.existing_resource) (errorBody.error as any).existing_resource = structured.existing_resource;
      if (structured.existing_resources) (errorBody.error as any).existing_resources = structured.existing_resources;
      response.status(status).json(errorBody);
      return;
    }

    console.error('Unhandled V1 exception:', exception);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      apiV1Error('INTERNAL_ERROR', '服务器内部错误', true, [], requestId),
    );
  }
}
