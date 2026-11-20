# searchSchematicLogicV2

> GET /api/v1/resources/schematics/logic-search · 契约：openapi-public-v1.json

检索公开已发布蓝图的 mlog 逻辑片段（纯静态，不执行脚本）

检索公开已发布蓝图的 mlog 逻辑片段（纯静态，不执行脚本） 匿名可读；携带 MindAuth Bearer 时需有 resource.read scope。公开对象以 public UUID 标识。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/schematics/logic-search`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `cursor` | 字符串 | 否 | Opaque cursor returned by the previous page.；最长 1024 |
| `limit` | 数字 | 否 | 最小 1；最大 100；默认 20 |
| `q` | 字符串 | 否 | 全文检索词；匹配资源标题、处理器类型、opcode、单位/方块名与源码；最长 200 |
| `opcode` | 字符串 | 否 | 最长 50 |
| `unit` | 字符串 | 否 | 最长 50 |
| `processor_type` | 字符串 | 否 | 最长 64 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 检索公开已发布蓝图的 mlog 逻辑片段（纯静态，不执行脚本）。响应使用 MDTBBS V1 { data, meta } 包装。 |
| `400` | 请求参数无效或分页游标无效。 |
| `401` | 携带的登录凭据无效。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源不存在、不可见或类型不匹配。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesSchematicsLogicSearchGetResponse

```json
{
  "data": {
    "items": [{
      "author": {},
      "estimated_cycle_ticks": 0.0,
      "findings": [{}],
      "has_warnings": false,
      "id": 0.0,
      "instruction_count": 0.0,
      "opcodes": ["string"],
      "position": {},
      "processor_type": "string",
      "referenced_blocks": ["string"],
      "referenced_units": ["string"],
      "resource_public_id": "string",
      "resource_url": "string",
      "source_excerpt": "string",
      "title": "string",
      "version": "string",
      "version_public_id": "string"
    }],
    "pagination": {
      "has_more": false,
      "next_cursor": "string"
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
  "$FORUM_BASE_URL/api/v1/resources/schematics/logic-search?cursor=<cursor>&limit=<limit>&q=<q>&opcode=<opcode>&unit=<unit>&processor_type=<processor_type>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
