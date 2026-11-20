# GameContentController_beginMapUpload

> POST /api/v1/game-content/maps/uploads · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：3 次 / 3600 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/game-content/maps/uploads`

### 表单参数

内容类型：`multipart/form-data`。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | 文件 | 是 | - |
| `sha256` | 字符串 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | - |
| `403` | 需要 OAuth scope：resource.upload |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** GameContentMapUploadCreatedDto

```json
{
  "expiresAt": "string",
  "preview": "string",
  "status": "string",
  "uploadId": "string"
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/game-content/maps/uploads" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@/path/to/file" \
  -F "sha256=<sha256>"
```
