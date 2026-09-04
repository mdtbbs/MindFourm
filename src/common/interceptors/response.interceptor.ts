import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { API_V1_CONTRACT, RAW_HTTP_RESPONSE } from '../decorators/api-v1.decorator';
import { apiV1Success } from '../contracts/api-v1.contract';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();
    const controller = context.getClass();

    const isV1 = [handler, controller].some((target) =>
      Reflect.getMetadata(API_V1_CONTRACT, target) === true,
    );
    const isRaw = [handler, controller].some((target) =>
      Reflect.getMetadata(RAW_HTTP_RESPONSE, target) === true,
    );
    const isSse = typeof request?.headers?.accept === 'string'
      && request.headers.accept.includes('text/event-stream');

    if (isRaw || isSse) return next.handle();

    return next.handle().pipe(
      map((data) => isV1
        ? apiV1Success(data, request.requestId)
        : { success: true, data }),
    );
  }
}
