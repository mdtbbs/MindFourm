# getSchematicResourceV2

> GET /api/v1/resources/schematics/{id} · 契约：openapi-public-v1.json

读取蓝图 Resource 与选定版本元数据

读取蓝图 Resource 与选定版本元数据 匿名可读；携带 MindAuth Bearer 时需有 resource.read scope。公开对象以 public UUID 标识。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/schematics/{id}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `cursor` | 字符串 | 否 | Opaque cursor returned by the previous page.；最长 1024 |
| `limit` | 数字 | 否 | 最小 1；最大 100；默认 20 |
| `version_public_id` | 字符串（UUID） | 否 | Select a published version by its public UUID; omitted selects the recommended/latest published version. |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 读取蓝图 Resource 与选定版本元数据。响应使用 MDTBBS V1 { data, meta } 包装。 |
| `400` | 请求参数无效或分页游标无效。 |
| `401` | 携带的登录凭据无效。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源不存在、不可见或类型不匹配。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesSchematicsIdGetResponse

```json
{
  "data": {
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
    },
    "schematic": {
      "block_count": 0.0,
      "dependencies": ["string"],
      "height": 0.0,
      "min_supported_build": 0.0,
      "parser_version": "string",
      "schematic_format_version": 0.0,
      "width": 0.0
    },
    "stats": {
      "downloads": 0.0,
      "favorites": 0.0,
      "likes": 0.0,
      "rating_average": 0.0,
      "rating_count": 0.0,
      "views": 0.0
    },
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
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/schematics/{id}?cursor=<cursor>&limit=<limit>&version_public_id=<version_public_id>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
