import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Blob responses carry per-owner data and are never replayable across accounts.
 *
 * Same reasoning as cloud saves: an intermediary must not hold a response that
 * contains another account's content URL or blob metadata.
 */
@Injectable()
export class BlobNoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse();
    if (typeof response?.setHeader === 'function') {
      response.setHeader('Cache-Control', 'private, no-store');
    }
    return next.handle();
  }
}
