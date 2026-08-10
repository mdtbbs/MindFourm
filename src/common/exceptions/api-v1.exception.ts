import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiV1Exception extends HttpException {
  constructor(
    readonly code: string,
    status: HttpStatus,
    message: string,
    readonly retryable = false,
    readonly details: unknown[] = [],
  ) {
    super({ code, message, retryable, details }, status);
  }
}
