import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'crypto';
import { map } from 'rxjs/operators';
import { RAW_HTTP_RESPONSE } from '@common/decorators/api-v1.decorator';

@Injectable()
export class GameContentCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const isRawResponse = [context.getHandler(), context.getClass()].some((target) =>
      Reflect.getMetadata(RAW_HTTP_RESPONSE, target) === true,
    );
    if (isRawResponse) return next.handle();

    return next.handle().pipe(map((body) => {
      // A handler may send a response directly and return Express's Response object.
      // Do not inspect or mutate it after headers have been committed.
      if (res.headersSent) return body;

      if (body && typeof body.getStream === 'function') {
        res.setHeader('Vary', 'Authorization');
        return body;
      }
      if (req.user) {
        res.setHeader('Cache-Control', 'private, no-store');
      } else if (typeof body !== 'undefined') {
        let serialized: Buffer | undefined;
        if (Buffer.isBuffer(body)) {
          serialized = body;
        } else {
          try {
            const json = JSON.stringify(body);
            if (typeof json === 'string') serialized = Buffer.from(json);
          } catch {
            // ETags are optional. Let Nest serialize the response normally and
            // let the exception filter handle any invalid circular response body.
          }
        }

        if (serialized) {
          res.setHeader('ETag', `"${createHash('sha256').update(serialized).digest('hex')}"`);
        } else {
          res.setHeader('Cache-Control', 'no-store');
        }
      }
      res.setHeader('Vary', 'Authorization');
      return body;
    }));
  }
}
