# getResourceWorkbenchV2

> GET /api/v1/resources/{id}/workbench · 契约：openapi-public-v1.json

读取公开或有权限访问的 Resource V2 工作台

读取公开或有权限访问的 Resource V2 工作台 匿名可读；携带 MindAuth Bearer 时需有 resource.read scope。公开对象以 public UUID 标识。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/workbench`

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
| `200` | 读取公开或有权限访问的 Resource V2 工作台。响应使用 MDTBBS V1 { data, meta } 包装。 |
| `400` | 请求参数无效或分页游标无效。 |
| `401` | 携带的登录凭据无效。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源不存在、不可见或类型不匹配。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesIdWorkbenchGetResponse

```json
{
  "data": {
    "analysis": {
      "completed_at": "string",
      "data": {},
      "findings": [{
        "actor": "string",
        "field_path": "string",
        "ignore_reason": "string",
        "ignored": false,
        "key": "string",
        "message": "string",
        "severity": "string",
        "timestamp": "string"
      }],
      "kind": "string",
      "parser_version": "string",
      "started_at": "string",
      "status": "string",
      "summary": {}
    },
    "permissions": {
      "can_manage": false,
      "role": "string"
    },
    "relations": [{
      "relation_context": "string",
      "relation_direction": "string", // Whether the current resource is the source or target of this relation.
      "relation_type": "string",
      "resource": {
        "public_id": "string",
        "resource_kind": "string",
        "title": "string"
      },
      "version": "string", // Published version label for the related resource, when a relation targets a specific version.
      "version_public_id": "string"
    }],
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
    "stats": {
      "downloads": 0.0,
      "favorites": 0.0,
      "likes": 0.0,
      "rating_average": 0.0,
      "rating_count": 0.0,
      "views": 0.0
    },
    "versions": [{
      "compatibility": [{
        "channel": "string",
        "confidence": "string",
        "game_version": "string",
        "max_game_version": "string",
        "min_game_version": "string",
        "notes": "string",
        "platform": "string",
        "runtime": "string",
        "source": "string",
        "status": "string"
      }],
      "dependencies": [{
        "dependency_type": "string",
        "external_identifier": "string",
        "resolution_status": "string",
        "resource_public_id": "string",
        "sort_order": 0.0,
        "upstream_url": "string",
        "version_constraint": "string"
      }],
      "display_version": "string",
      "files": [{
        "architecture": "string",
        "availability_status": "string",
        "delivery_mode": "string",
        "display_name": "string",
        "download_url": "string",
        "downloadable": false,
        "installable": false,
        "integrity_status": "string",
        "mime_type": "string",
        "original_filename": "string",
        "package_type": "string",
        "platform": "string",
        "public_id": "string",
        "role": "string",
        "sha256": "string",
        "size_bytes": 0.0
      }],
      "game_version_max": "string",
      "game_version_min": "string",
      "preview_url": "string",
      "public_id": "string",
      "published_at": "string",
      "recommended": false,
      "release_channel": "string",
      "revision": 0.0,
      "status": "string",
      "version": "string",
      "version_mode": "string"
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
  "$FORUM_BASE_URL/api/v1/resources/{id}/workbench?cursor=<cursor>&limit=<limit>&version_public_id=<version_public_id>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
