export type ApiV1Meta = { request_id: string };

export type ApiV1Success<T> = {
  data: T;
  meta: ApiV1Meta;
};

export type ApiV1Error = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details: unknown[];
  };
  meta: ApiV1Meta;
};

export function apiV1Success<T>(data: T, requestId: string): ApiV1Success<T> {
  return { data, meta: { request_id: requestId } };
}

export function apiV1Error(
  code: string,
  message: string,
  retryable: boolean,
  details: unknown[],
  requestId: string,
): ApiV1Error {
  return { error: { code, message, retryable, details }, meta: { request_id: requestId } };
}
