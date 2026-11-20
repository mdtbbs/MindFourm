# BlobsController_list

> GET /api/v1/blobs · 契约：openapi-public-v1.json

列出我的 blob

只返回当前所有者的有效 blob；下一页游标位于 meta.next_cursor。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`blob.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：120 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/blobs`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `namespace` | 字符串 | 否 | 按 namespace 过滤；最长 64 |
| `ref_type` | 字符串 | 否 | 按业务引用类型过滤；最长 32 |
| `ref_id` | 字符串 | 否 | 按业务引用 ID 过滤；最长 64 |
| `cursor` | 字符串 | 否 | 上一页 meta.next_cursor 返回的不透明游标；最长 300 |
| `limit` | 数字 | 否 | 最小 1；最大 100 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 当前页的 blob 列表；下一页游标位于 meta.next_cursor。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** BlobDto数组

```json
[
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
]
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/blobs?namespace=<namespace>&ref_type=<ref_type>&ref_id=<ref_id>&cursor=<cursor>&limit=<limit>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
