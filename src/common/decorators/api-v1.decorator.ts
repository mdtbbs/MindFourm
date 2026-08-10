import { SetMetadata } from '@nestjs/common';

export const API_V1_CONTRACT = 'mdtbbs:api-v1';
export const RAW_HTTP_RESPONSE = 'mdtbbs:raw-http-response';

export function ApiV1(): MethodDecorator & ClassDecorator {
  return SetMetadata(API_V1_CONTRACT, true);
}

export function RawHttpResponse(): MethodDecorator & ClassDecorator {
  return SetMetadata(RAW_HTTP_RESPONSE, true);
}
