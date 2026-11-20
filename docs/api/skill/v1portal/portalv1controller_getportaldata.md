# PortalV1Controller_getPortalData

> GET /api/v1/portal · 契约：openapi-public-v1.json

## 认证与权限

- 认证：公开；无需 access token。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/portal`

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Portal homepage data |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）没有响应体。

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/portal"
```
