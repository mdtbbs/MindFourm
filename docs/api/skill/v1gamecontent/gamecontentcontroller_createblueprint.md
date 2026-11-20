# GameContentController_createBlueprint

> POST /api/v1/game-content/blueprints · 契约：openapi-public-v1.json

Submit a blueprint through the existing resource moderation flow

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：5 次 / 3600 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/game-content/blueprints`

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "code": "string", // Mindustry schematic Base64 code
  "description": "string",
  "tags": ["string"],
  "title": "string"
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `403` | 需要 OAuth scope：resource.upload |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

> 契约未声明成功响应：该接口是否可用、返回什么，取决于站点策略与运行时状态。

调用方应按状态码分支处理，不要假设返回 JSON 结构。

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/game-content/blueprints" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "code": "string",
  "description": "string",
  "tags": ["string"],
  "title": "string"
}
JSON
```
