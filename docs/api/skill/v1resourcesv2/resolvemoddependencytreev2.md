# resolveModDependencyTreeV2

> GET /api/v1/resources/mods/{id}/dependency-resolution · 契约：openapi-public-v1.json

解析 Mod 版本的直接与传递依赖；包含未收录项、循环与截断状态

解析 Mod 版本的直接与传递依赖；包含未收录项、循环与截断状态 匿名可读；携带 MindAuth Bearer 时需有 resource.read scope。公开对象以 public UUID 标识。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：30 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/mods/{id}/dependency-resolution`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `version_public_id` | 字符串（UUID） | 否 | Select a published version; omitted selects the recommended/latest published version. |
| `max_depth` | 数字 | 否 | Maximum dependency tree depth.；最小 1；最大 12 |
| `max_nodes` | 数字 | 否 | Maximum dependency nodes loaded and resolved.；最小 1；最大 200 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 解析 Mod 版本的直接与传递依赖；包含未收录项、循环与截断状态。响应使用 MDTBBS V1 { data, meta } 包装。 |
| `400` | 请求参数无效或分页游标无效。 |
| `401` | 携带的登录凭据无效。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源不存在、不可见或类型不匹配。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesModsIdDependencyResolutionGetResponse

```json
{
  "data": {
    "cycles": ["<unknown>"],
    "direct": [{
      "children": ["<循环引用>"],
      "constraint": "string",
      "kind": "string",
      "mod_id": "string",
      "status": "string",
      "title": "string",
      "version": "string"
    }],
    "root_mod_id": "string",
    "tree": [{
      "children": ["<循环引用>"],
      "constraint": "string",
      "kind": "string",
      "mod_id": "string",
      "status": "string",
      "title": "string",
      "version": "string"
    }],
    "truncated": false,
    "unresolved": [{}],
    "warnings": ["string"]
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
  "$FORUM_BASE_URL/api/v1/resources/mods/{id}/dependency-resolution?version_public_id=<version_public_id>&max_depth=<max_depth>&max_nodes=<max_nodes>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
