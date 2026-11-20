# GameContentController_blueprintDetail

> GET /api/v1/game-content/blueprints/{id} · 契约：openapi-public-v1.json

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：120 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/game-content/blueprints/{id}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | - |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** GameContentBlueprintDetailDto

```json
{
  "author": {
    "avatar": "string",
    "id": 0.0,
    "username": "string"
  },
  "blocks": [{
    "count": 0.0,
    "icon": "string",
    "id": "string",
    "name": "string"
  }],
  "createdAt": "string",
  "description": "string",
  "featured": false,
  "game": {
    "minBuild": 0.0,
    "version": "string"
  },
  "id": "string",
  "links": {
    "code": "string",
    "download": "string",
    "web": "string"
  },
  "materials": [{
    "amount": 0.0,
    "icon": "string",
    "id": "string",
    "name": "string"
  }],
  "preview": {
    "height": 0.0,
    "image": "string",
    "width": 0.0
  },
  "production": {
    "available": false,
    "complete": false,
    "items": {
      "inputs": [{
        "estimated": false, // True when this is a long-run probability-weighted expectation
        "icon": "string",
        "id": "string",
        "name": "string",
        "rate": 0.0 // Rate per second
      }],
      "internal": [{
        "consumed": 0.0,
        "estimated": false,
        "icon": "string",
        "id": "string",
        "name": "string",
        "net": 0.0, // produced - consumed, per second
        "produced": 0.0
      }],
      "outputs": [{
        "estimated": false, // True when this is a long-run probability-weighted expectation
        "icon": "string",
        "id": "string",
        "name": "string",
        "rate": 0.0 // Rate per second
      }]
    },
    "liquids": {
      "inputs": [{
        "estimated": false, // True when this is a long-run probability-weighted expectation
        "icon": "string",
        "id": "string",
        "name": "string",
        "rate": 0.0 // Rate per second
      }],
      "internal": [{
        "consumed": 0.0,
        "estimated": false,
        "icon": "string",
        "id": "string",
        "name": "string",
        "net": 0.0, // produced - consumed, per second
        "produced": 0.0
      }],
      "outputs": [{
        "estimated": false, // True when this is a long-run probability-weighted expectation
        "icon": "string",
        "id": "string",
        "name": "string",
        "rate": 0.0 // Rate per second
      }]
    },
    "mode": "string",
    "power": {
      "consumed": 0.0, // Power consumed per second
      "generated": 0.0, // Power generated per second
      "net": 0.0 // generated - consumed, per second
    },
    "warnings": [{
      "blockId": "string",
      "blockName": "string",
      "count": {}, // null when official schematic decoding discards the unknown block placements
      "message": "string",
      "type": "string"
    }]
  }, // Cached theoretical full-load production rates per second
  "resourceId": 0.0,
  "stats": {
    "downloads": 0.0,
    "favorites": 0.0,
    "likes": 0.0,
    "views": 0.0 // 真实 Resource.view_count，详情仅在成功读取公开资源后递增
  },
  "tags": ["string"],
  "title": "string",
  "type": "string",
  "updatedAt": "string",
  "viewer": {
    "canEdit": false,
    "favorited": false,
    "liked": false
  }
}
```

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/game-content/blueprints/{id}" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
