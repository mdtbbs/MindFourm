# getModCompatibilityV2

> GET /api/v1/resources/mods/{id}/compatibility · 契约：openapi-public-v1.json

读取 Mod 版本兼容性与公开社区报告

读取 Mod 版本兼容性与公开社区报告 匿名可读；携带 MindAuth Bearer 时需有 resource.read scope。公开对象以 public UUID 标识。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/mods/{id}/compatibility`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `cursor` | 字符串 | 否 | Opaque cursor returned in the previous page pagination.next_cursor.；最长 1024 |
| `limit` | 数字 | 否 | 最小 1；最大 100 |
| `version_public_id` | 字符串（UUID） | 否 | Select a published version; omitted selects the recommended/latest published version. |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 读取 Mod 版本兼容性与公开社区报告。响应使用 MDTBBS V1 { data, meta } 包装。 |
| `400` | 请求参数无效或分页游标无效。 |
| `401` | 携带的登录凭据无效。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源不存在、不可见或类型不匹配。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesModsIdCompatibilityGetResponse

```json
{
  "data": {
    "items": [{
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
    "reports": [{
      "body": {},
      "game_version": {},
      "platform_key": {},
      "runtime": "string",
      "status": "string"
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
  "$FORUM_BASE_URL/api/v1/resources/mods/{id}/compatibility?cursor=<cursor>&limit=<limit>&version_public_id=<version_public_id>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
