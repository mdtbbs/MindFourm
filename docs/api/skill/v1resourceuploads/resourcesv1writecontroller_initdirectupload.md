# ResourcesV1WriteController_initDirectUpload

> POST /api/v1/resources/uploads/init · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：10 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/uploads/init`

### 请求体

内容类型：`application/json`。

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | Creates an owner-bound RES direct upload session. The upload token is short lived; complete is always required. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** ResourceDirectUploadInitResponseDto

```json
{
  "complete_required": 0.0,
  "deduplicated": false,
  "id": "string",
  "object_id": "string",
  "object_public_id": "string",
  "upload": {
    "expires_at": "string",
    "session_id": "string",
    "token": "string", // Short-lived upload token. Never the RES service API key.
    "url": "string"
  }
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/uploads/init" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
