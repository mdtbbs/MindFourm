# ResourcesV1WriteController_directUploadStatus

> GET /api/v1/resources/uploads/{sessionId}/status · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/uploads/{sessionId}/status`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sessionId` | 字符串（UUID） | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Owner-only queued upload verification status. Processing is not a completed upload; validation errors retain their HTTP status. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** 以下两种形态之一

该接口按查询参数返回两种分页形态中的一种：

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/uploads/{sessionId}/status" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
