# BlobsController_content

> GET /api/v1/blobs/{blobId}/content · 契约：openapi-public-v1.json

下载 blob 内容

public blob 无需登录即可下载，私有 blob 需所有者身份。只有白名单内的媒体类型会内联渲染，其余一律以附件下载，避免上传者声明的类型变成可执行内容。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`blob.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：300 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/blobs/{blobId}/content`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `blobId` | 字符串 | 是 | blob UUID |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 原始字节。白名单内的媒体类型按存储的 MIME 返回，其余一律 application/octet-stream 附件。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：blob.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

成功响应（`200`）返回 `application/octet-stream`：直接是文件内容，不使用 `{ data, meta }` 信封。

调用方应检查状态码、`Content-Type`、`ETag` 或文件哈希，不要按 JSON 解析。

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/blobs/{blobId}/content" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
