# submitModConflictReportV2

> POST /api/v1/resources/mods/conflicts · 契约：openapi-public-v1.json

提交包含多个已发布 Mod 版本的冲突报告

要求登录并完成手机号验证。最初状态为 unverified，成员数限制为 2–10。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：10 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/mods/conflicts`

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "body": {},
  "game_version_max": {},
  "game_version_min": {},
  "members": [{
    "resource_public_id": "string",
    "version_constraint": {},
    "version_public_id": "string"
  }],
  "title": {}
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | Conflict report and public UUID members were saved with unverified status. |
| `400` | Invalid members, versions, or conflict details. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `404` | A Mod or published version does not exist or is not visible. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`201`）没有响应体。

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/mods/conflicts" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "body": {},
  "game_version_max": {},
  "game_version_min": {},
  "members": [{
    "resource_public_id": "string",
    "version_constraint": {},
    "version_public_id": "string"
  }],
  "title": {}
}
JSON
```
