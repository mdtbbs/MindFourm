# listResourceEmbedCardsV2

> GET /api/v1/resources/embeds/cards · 契约：openapi-public-v1.json

批量读取富文本资源卡片

批量读取富文本资源卡片 匿名可读；携带 MindAuth Bearer 时需有 resource.read scope。公开对象以 public UUID 标识。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/embeds/cards`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ids` | 字符串 | 是 | 逗号分隔的 Resource public UUID，最多 10 个 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 批量读取富文本资源卡片。响应使用 MDTBBS V1 { data, meta } 包装。 |
| `400` | 请求参数无效或分页游标无效。 |
| `401` | 携带的登录凭据无效。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源不存在、不可见或类型不匹配。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesEmbedsCardsGetResponse

```json
{
  "data": {
    "items": [{
      "author": {
        "avatar_url": "string",
        "id": 0.0,
        "username": "string"
      },
      "download_url": "string",
      "map": {},
      "preview_url": "string",
      "reason": "string",
      "resource_kind": "string",
      "resource_public_id": "string",
      "schematic": {},
      "status": "string",
      "summary": "string",
      "title": "string",
      "url": "string",
      "version": "string",
      "version_public_id": "string"
    }]
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
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/embeds/cards?ids=<ids>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
