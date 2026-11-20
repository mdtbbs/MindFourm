# getMapDiffOverlayV2

> GET /api/v1/resources/maps/{id}/diff/overlay · 契约：openapi-public-v1.json

读取地图版本差异的透明叠加层 PNG

匿名可读；携带 MindAuth Bearer 时需有 resource.read scope。叠加层由 renderer 生成并与当前版本对绑定。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：30 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/maps/{id}/diff/overlay`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `from_version_public_id` | 字符串（UUID） | 否 | Source version public UUID. If omitted, the previous published version is selected. |
| `to_version_public_id` | 字符串（UUID） | 否 | Target version public UUID. If omitted, the recommended/latest published version is selected. |
| `offset_x` | 数字 | 否 | 蓝图坐标对齐微调；非 0 时不写入缓存；最小 -127；最大 127；默认 0 |
| `offset_y` | 数字 | 否 | 蓝图坐标对齐微调；非 0 时不写入缓存；最小 -127；最大 127；默认 0 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | PNG 差异叠加层。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源、版本对或叠加层不存在。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）返回 `image/png`：直接是文件内容，不使用 `{ data, meta }` 信封。

调用方应检查状态码、`Content-Type`、`ETag` 或文件哈希，不要按 JSON 解析。

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/maps/{id}/diff/overlay?from_version_public_id=<from_version_public_id>&to_version_public_id=<to_version_public_id>&offset_x=<offset_x>&offset_y=<offset_y>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
