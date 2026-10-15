# reviewResourceVersionV2

> POST /api/v1/resources/{id}/versions/{versionId}/review · 契约：openapi-public-v1.json

审核一个 ResourceVersion

仅管理员或版主可以 approve、reject 或 request_changes。只审核待审版本，不会隐藏该 Resource 的其他已发布版本。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：20 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/review`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |
| `versionId` | 字符串（UUID） | 是 | ResourceVersion public UUID |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "action": "string",
  "reason": "string" // 审核说明；reject 和 request_changes 必填。
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Version review action was recorded. |
| `400` | Review action, reason, or version state is invalid. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | Only an administrator or moderator can review versions. |
| `404` | Resource or version does not exist. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）没有响应体。

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/review" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "action": "string",
  "reason": "string"
}
JSON
```
