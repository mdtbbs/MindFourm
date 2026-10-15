# GameContentController_uploadSession

> GET /api/v1/game-content/maps/uploads/{uploadId} · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/game-content/maps/uploads/{uploadId}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `uploadId` | 字符串 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | - |
| `403` | 需要 OAuth scope：resource.upload |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** GameContentUploadStatusDto

```json
{
  "expiresAt": "string",
  "resourceId": 0.0,
  "status": "string",
  "uploadId": "string"
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/game-content/maps/uploads/{uploadId}" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
