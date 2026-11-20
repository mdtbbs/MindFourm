# BlobsController_commit

> POST /api/v1/blobs/uploads/{uploadId}/commit · 契约：openapi-public-v1.json

提交 blob

服务端复核存储对象的大小与 SHA-256 后创建可读写 blob；同 key 的旧 blob 会被替换并进入延迟回收。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`blob.write`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 600 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/blobs/uploads/{uploadId}/commit`

### 请求头

| 请求头 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `idempotency-key` | 字符串 | 是 | 按所有者重放同一提交请求，保留 24 小时 |

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `uploadId` | 字符串 | 是 | 上传会话 UUID |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | - |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** BlobCommitResponseDto

```json
{
  "blob": {
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
  },
  "committed": 0.0
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/blobs/uploads/{uploadId}/commit" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: <idempotency-key>"
```
