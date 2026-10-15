# ResourcesV1Controller_downloadFile

> GET /api/v1/resources/{resourceId}/versions/{versionId}/files/{fileId}/download · 契约：openapi-public-v1.json

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.download`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{resourceId}/versions/{versionId}/files/{fileId}/download`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `resourceId` | 字符串 | 是 | - |
| `versionId` | 字符串 | 是 | - |
| `fileId` | 字符串 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.download |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

> 契约未声明成功响应：该接口是否可用、返回什么，取决于站点策略与运行时状态。

调用方应按状态码分支处理，不要假设返回 JSON 结构。

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/{resourceId}/versions/{versionId}/files/{fileId}/download" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
