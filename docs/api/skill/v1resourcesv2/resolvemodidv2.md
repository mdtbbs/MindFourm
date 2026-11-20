# resolveModIdV2

> GET /api/v1/resources/mods/{id}/resolve · 契约：openapi-public-v1.json

将 Mod ID 或历史 alias 解析到公开 Resource

将 Mod ID 或历史 alias 解析到公开 Resource 匿名可读；携带 MindAuth Bearer 时需有 resource.read scope。公开对象以 public UUID 标识。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/mods/{id}/resolve`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串 | 是 | Canonical Mod ID、历史 alias 或 Resource public UUID |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 将 Mod ID 或历史 alias 解析到公开 Resource。响应使用 MDTBBS V1 { data, meta } 包装。 |
| `400` | 请求参数无效或分页游标无效。 |
| `401` | 携带的登录凭据无效。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源不存在、不可见或类型不匹配。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesModsIdResolveGetResponse

```json
{
  "data": {
    "aliases": ["string"],
    "canonical_mod_id": "string",
    "requested_mod_id": "string",
    "resource": {
      "content": "string",
      "content_format": "string",
      "content_html": "string",
      "content_json": {},
      "content_schema_version": 0.0,
      "content_text": "string",
      "description": "string",
      "license": "string",
      "metadata": {}, // Allowlisted public projection of parsed metadata. Private storage and raw metadata fields are omitted.
      "public_id": "string",
      "renderer": {}, // Public renderer state and allowlisted parsed metadata; never includes storage keys or private error details.
      "resource_kind": "string",
      "source_url": "string",
      "summary": "string",
      "title": "string",
      "visibility": "string"
    }
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
  "$FORUM_BASE_URL/api/v1/resources/mods/{id}/resolve" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
