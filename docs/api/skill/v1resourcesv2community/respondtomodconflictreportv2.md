# respondToModConflictReportV2

> POST /api/v1/resources/mods/conflicts/{reportId}/author-response · 契约：openapi-public-v1.json

由冲突涉及的 Mod Owner 或 Maintainer 回复冲突报告

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：20 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/mods/conflicts/{reportId}/author-response`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `reportId` | 字符串（UUID） | 是 | - |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "author_response": {},
  "author_response_status": "string",
  "fixed_resource_public_id": "string", // Resource UUID for the Mod whose published release fixes the conflict.
  "fixed_resource_version_public_id": "string" // Required when author_response_status is fixed.
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Author response saved; fixed must reference a published release of a conflict member. |
| `400` | Invalid response or fixed release. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `404` | Conflict report or fixed release does not exist. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）没有响应体。

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/mods/conflicts/{reportId}/author-response" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "author_response": {},
  "author_response_status": "string",
  "fixed_resource_public_id": "string",
  "fixed_resource_version_public_id": "string"
}
JSON
```
