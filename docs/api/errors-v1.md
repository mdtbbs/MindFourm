# Public V1 Error Handling

V1 JSON failures preserve the existing `{ error, meta }` response envelope:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "请求过于频繁",
    "retryable": true,
    "details": []
  },
  "meta": { "request_id": "req_..." }
}
```

Use the HTTP status and stable `error.code` for program control flow. `message` is user-facing text and may be translated. `meta.request_id` is the support reference. The online [error code table](/api/v1/docs/errors) is generated from the server's V1 error registry.

For HTTP 429, wait at least the `Retry-After` duration. Use bounded exponential backoff for retryable failures; do not retry a non-retryable code without changing the request or user state.

Raw file, image and redirect responses are not wrapped in the JSON envelope. Inspect their HTTP status, `Content-Type`, and response headers.
