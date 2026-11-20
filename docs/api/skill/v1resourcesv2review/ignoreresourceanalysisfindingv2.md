# ignoreResourceAnalysisFindingV2

> POST /api/v1/resources/{id}/versions/{versionId}/analysis/overrides · 契约：openapi-public-v1.json

忽略已发布版本的一条分析结果

只允许该 Resource 的 Owner/Maintainer 操作；ERROR/WARNING 仍记录在原始分析中，忽略记录带 reason、actor、timestamp 和 parser_version。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：20 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/analysis/overrides`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |
| `versionId` | 字符串（UUID） | 是 | Published version public UUID |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "finding_key": "string",
  "reason": "string" // 说明忽略该 ERROR/WARNING 的原因。
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | Finding ignore was saved. |
| `400` | Finding is not an ERROR/WARNING or request is invalid. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | Current user is not an active Owner or Maintainer. |
| `404` | Resource, published version, or finding does not exist. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesIdVersionsVersionIdAnalysisOverridesPostResponse

```json
{
  "data": {
    "actor": "string",
    "changed": false,
    "finding_key": "string",
    "ignored": false,
    "parser_version": "string",
    "reason": "string",
    "resource_public_id": "string",
    "severity": "string",
    "timestamp": "string",
    "version_public_id": "string"
  },
  "meta": {
    "next_cursor": "string",
    "pagination": {},
    "request_id": "string"
  }
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/analysis/overrides" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "finding_key": "string",
  "reason": "string"
}
JSON
```
