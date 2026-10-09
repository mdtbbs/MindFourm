import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiV1Exception extends HttpException {
  constructor(
    readonly code: string,
    status: HttpStatus,
    message: string,
    readonly retryable = false,
    readonly details: unknown[] = [],
    /**
     * HTTP status the caller asked for, when it disagrees with `status`.
     *
     * Filtered public V1 responses must keep publishing the status the endpoint
     * already returned (changing SESSION_PERMISSION_DENIED from 400 to 403 would
     * be a breaking contract change), while the registry status still governs
     * anything a caller reads from the exception itself.
     */
    readonly requestedStatus: HttpStatus = status,
  ) {
    super({ code, message, retryable, details }, status);
  }
}
