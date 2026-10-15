# BlobsController_create

> POST /api/v1/blobs · 契约：openapi-public-v1.json

创建 blob 上传

登记目标 key 与内容指纹。若相同内容已存在则 deduplicated=true，无需再上传；否则返回 upload.url，PUT 成功后调用 commit。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`blob.write`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 600 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/blobs`

### 请求头

| 请求头 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `idempotency-key` | 字符串 | 是 | 按所有者重放同一创建请求，保留 24 小时 |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "expires_in_seconds": 0.0, // Lifetime in seconds. Temporary blobs are deleted by maintenance once expired; omit for a durable blob.
  "file_name": "string",
  "key": "string", // Logical name, unique among the live blobs of one owner in a namespace. Reusing it replaces the previous blob.
  "metadata": {}, // Free-form JSON metadata. Business data lives with the owning service, not here.
  "mime_type": "string",
  "namespace": "string", // Storage namespace ("bucket"). Namespaces isolate key names and listing; they are not a security boundary inside one owner.
  "ref_id": "string",
  "ref_type": "string", // Optional opaque correlation to the business object this blob belongs to.
  "sha256": "string", // Required SHA-256 of the exact bytes. It binds the upload session to the content the caller claims to hold.
  "size_bytes": 0.0,
  "tags": ["string"],
  "visibility": "string" // Private blobs are readable only by their owner; public blobs are readable by anyone holding the blob ID.
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | - |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** BlobCreatedDto

```json
{
  "blob_id": "string",
  "commit_required": 0.0,
  "deduplicated": false, // True when identical bytes already exist for this owner, so no PUT is required before commit.
  "upload": {
    "expires_at": "string",
    "url": "string" // Absolute URL to PUT the raw bytes to.
  }, // Present when the caller must PUT the bytes before committing.
  "upload_id": "string" // Upload session ID. Present whenever bytes still have to be transferred.
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/blobs" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: <idempotency-key>" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "expires_in_seconds": 0.0,
  "file_name": "string",
  "key": "string",
  "metadata": {},
  "mime_type": "string",
  "namespace": "string",
  "ref_id": "string",
  "ref_type": "string",
  "sha256": "string",
  "size_bytes": 0.0,
  "tags": ["string"],
  "visibility": "string"
}
JSON
```
