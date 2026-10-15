# getResourceVersionPreviewV2

> GET /api/v1/resources/{id}/versions/{versionId}/preview · 契约：openapi-public-v1.json

读取指定版本预览 PNG

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：30 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/preview`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |
| `versionId` | 字符串（UUID） | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | PNG preview bytes for the selected version, falling back to the current resource preview when no version preview exists. |
| `302` | Redirects new RES previews to their public URL; historical PNG bytes remain supported. |
| `401` | 携带的登录凭据无效。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `404` | 资源、已发布版本或预览不存在。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）返回 `image/png`：直接是文件内容，不使用 `{ data, meta }` 信封。

调用方应检查状态码、`Content-Type`、`ETag` 或文件哈希，不要按 JSON 解析。

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/{id}/versions/{versionId}/preview" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
