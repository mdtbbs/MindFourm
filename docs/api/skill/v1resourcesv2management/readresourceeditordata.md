# readResourceEditorData

> GET /api/v1/resources/{id}/versions/{versionId}/editor-data · 契约：openapi-public-v1.json

读取已发布版本的官方编辑数据

历史版本缺少结构化索引时，校验源文件并按官方 reader/writer 重新解析；不修改原资源或回填数据库。公开资源允许编辑副本。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/editor-data`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | - |
| `versionId` | 字符串（UUID） | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 版本对应的官方元数据和有界方块列表。 |
| `400` | 文件无法安全解析或资源类型不支持。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源不可见或已发布版本不存在。 |
| `503` | 官方解析器或资源存储未就绪。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesIdVersionsVersionIdEditorDataGetResponse

```json
{
  "blocks": [{
    "count": 0,
    "display_name": "string",
    "internal_name": "string",
    "positions": [{}]
  }],
  "metadata": {},
  "parser_version": "string"
}
```

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/editor-data" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
