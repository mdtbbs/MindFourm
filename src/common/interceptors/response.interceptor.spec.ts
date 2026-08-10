import 'reflect-metadata';
import { of, firstValueFrom } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';
import { ApiV1, RawHttpResponse } from '../decorators/api-v1.decorator';

class LegacyHandler {
  json() {}
}

class V1Handler {
  @ApiV1()
  json() {}

  @ApiV1()
  @RawHttpResponse()
  raw() {}
}

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();
  const legacyHandler = new LegacyHandler();
  const v1Handler = new V1Handler();

  const contextFor = (
    target: object,
    method: string,
    headers: Record<string, string> = {},
  ) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers, requestId: 'req-123' }) }),
    getHandler: () => (target as any)[method],
    getClass: () => target.constructor,
  }) as any;

  it('preserves the Legacy success envelope', async () => {
    const result = await firstValueFrom(interceptor.intercept(
      contextFor(legacyHandler, 'json'),
      { handle: () => of({ id: 7 }) },
    ));

    expect(result).toEqual({ success: true, data: { id: 7 } });
  });

  it('serializes a V1 JSON handler as data plus request metadata', async () => {
    const result = await firstValueFrom(interceptor.intercept(
      contextFor(v1Handler, 'json'),
      { handle: () => of({ id: 7 }) },
    ));

    expect(result).toEqual({ data: { id: 7 }, meta: { request_id: 'req-123' } });
  });

  it('does not wrap a V1 raw handler', async () => {
    const payload = Buffer.from('binary');
    const result = await firstValueFrom(interceptor.intercept(
      contextFor(v1Handler, 'raw'),
      { handle: () => of(payload) },
    ));

    expect(result).toBe(payload);
  });

  it('does not wrap an SSE request', async () => {
    const result = await firstValueFrom(interceptor.intercept(
      contextFor(v1Handler, 'json', { accept: 'text/event-stream' }),
      { handle: () => of({ type: 'notification' }) },
    ));

    expect(result).toEqual({ type: 'notification' });
  });
});
