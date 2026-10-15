# BlobsController_update

> PATCH /api/v1/blobs/{blobId} · 契约：openapi-public-v1.json

更新 blob 元数据

修改 key、文件名、可见性、元数据、标签与业务引用；内容本身不可变。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`blob.write`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：120 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `PATCH`

**地址：** `$FORUM_BASE_URL/api/v1/blobs/{blobId}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `blobId` | 字符串 | 是 | blob UUID |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "file_name": "string",
  "key": "string", // 新的逻辑名。重命名到已被占用的 key 会返回 BLOB_KEY_CONFLICT；要替换某个 key 的内容，请用该 key 重新上传。
  "metadata": {},
  "ref_id": {},
  "ref_type": {},
  "tags": ["string"],
  "visibility": "string"
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | - |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
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
curl --fail-with-body -X PATCH \
  "$FORUM_BASE_URL/api/v1/blobs/{blobId}" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "file_name": "string",
  "key": "string",
  "metadata": {},
  "ref_id": {},
  "ref_type": {},
  "tags": ["string"],
  "visibility": "string"
}
JSON
```
