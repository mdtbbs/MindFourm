# BlobsController_get

> GET /api/v1/blobs/{blobId} · 契约：openapi-public-v1.json

查看 blob 详情

无需登录即可读取 public blob；私有 blob 仅所有者可见，不可见时与不存在返回相同的 404。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`blob.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：300 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/blobs/{blobId}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `blobId` | 字符串 | 是 | blob UUID |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | - |
| `403` | 携带 MindAuth Bearer 时需要 scope：blob.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** BlobDto

```json
{
  "content_url": "string", // Stable authenticated URL that returns the bytes.
  "created_at": "string",
  "expires_at": {}, // Expiry for temporary blobs; null for durable blobs.
  "file_name": "string",
  "id": "string",
  "key": "string", // Logical name chosen by the owner.
  "metadata": {}, // Caller-supplied JSON metadata.
  "mime_type": "string",
  "namespace": "string",
  "ref_id": {},
  "ref_type": {},
  "sha256": "string",
  "size_bytes": 0.0,
  "tags": ["string"],
  "updated_at": "string",
  "visibility": "string"
}
```

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/blobs/{blobId}" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
