# 公开 V1 错误处理

V1 JSON 错误沿用稳定的 `{ error, meta }` 响应结构：

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "请求过于频繁",
    "retryable": true,
    "details": [],
    "documentation_url": "https://mdtbbs.cn/api/v1/docs/errors#rate-limited"
  },
  "meta": { "request_id": "req_..." }
}
```

程序应依据 HTTP 状态码和稳定的 `error.code` 决定处理方式。`message` 是面向用户的提示，可能会随语言变化。`meta.request_id` 可用于向维护者查询问题。`error.documentation_url` 指向错误代码对应的固定说明位置；例如 `RATE_LIMITED` 对应 `#rate-limited`。在线[错误代码表](/api/v1/docs/errors)由服务器的 V1 错误代码注册表生成。

收到 HTTP 429 时，至少等待 `Retry-After` 指定的时长。对于可重试错误，请使用有上限的指数退避；对于不可重试错误，应先修改请求或用户状态，不要直接重试。

原始文件、图片和重定向响应不使用 JSON 响应结构。请检查 HTTP 状态码、`Content-Type` 和响应头。
