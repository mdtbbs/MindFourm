import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'crypto';
import { map } from 'rxjs/operators';

@Injectable()
export class GameContentCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    return next.handle().pipe(map((body) => {
      if (body && typeof body.getStream === 'function') {
        res.setHeader('Vary', 'Authorization');
        return body;
      }
      if (req.user) {
        res.setHeader('Cache-Control', 'private, no-store');
      } else if (typeof body !== 'undefined') {
        const serialized = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
        res.setHeader('ETag', `"${createHash('sha256').update(serialized).digest('hex')}"`);
      }
      res.setHeader('Vary', 'Authorization');
      return body;
    }));
  }
}
