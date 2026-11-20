# readResourceMapEditRegion

> GET /api/v1/resources/{id}/versions/{versionId}/map-editor/region · 契约：openapi-public-v1.json

读取已发布地图的有界编辑分区

只读取 128×128 范围；公开资源可读，私有资源保留管理权限检查。源文件校验与官方 MapIO 加载不变。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：20 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/map-editor/region`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | - |
| `versionId` | 字符串（UUID） | 是 | - |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `x` | 数字 | 是 | 分区左上角 X 坐标，非负整数 |
| `y` | 数字 | 是 | 分区左上角 Y 坐标，非负整数 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 最多 128×128 的完整官方地图分区。 |
| `400` | 坐标越界或文件无法安全解析。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源不可见或已发布版本不存在。 |
| `503` | 官方解析器或资源存储未就绪。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesIdVersionsVersionIdMapEditorRegionGetResponse

```json
{
  "terrain": [{
    "floor": "string",
    "overlay": "string",
    "x": 0,
    "y": 0
  }]
}
```

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/map-editor/region?x=<x>&y=<y>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
