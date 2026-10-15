# GameContentController_feed

> GET /api/v1/game-content/feed · 契约：openapi-public-v1.json

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：120 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/game-content/feed`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | 数字 | 否 | 每个 Feed 分区最多返回数量，默认 20；最小 1；最大 50 |
| `type` | 字符串 | 否 | 返回精选、最新、热门或全部内容分区；可选值：featured / latest / trending / all |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | - |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** GameContentFeedResponseDto

```json
{
  "sections": [{
    "items": [{
      "author": {
        "avatar": "string",
        "id": 0.0,
        "username": "string"
      },
      "createdAt": "string",
      "featured": false,
      "game": {
        "minBuild": 0.0,
        "version": "string"
      },
      "id": "string",
      "preview": {
        "height": 0.0,
        "thumbnail": "string",
        "width": 0.0
      },
      "resourceId": 0.0,
      "stats": {
        "downloads": 0.0,
        "favorites": 0.0,
        "likes": 0.0,
        "views": 0.0 // 真实 Resource.view_count，详情仅在成功读取公开资源后递增
      },
      "summary": "string",
      "tags": ["string"],
      "title": "string",
      "type": "string",
      "updatedAt": "string"
    }],
    "title": "string",
    "type": "string"
  }]
}
```

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/game-content/feed?limit=<limit>&type=<type>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
