# ResourcesV1WriteController_createUploadDraft

> POST /api/v1/resources/drafts · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：5 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/drafts`

### 表单参数

内容类型：`multipart/form-data`。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `resource_kind` | 字符串 | 是 | 可选值：mod / map / schematic / save / game_version / server_plugin / development_tool / texture_ui / pack / other |
| `file` | 文件 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | Creates a durable owner-bound upload draft in quarantine and returns exact duplicate findings. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesDraftsPostResponse

```json
{
  "duplicate": {
    "exact": false, // Exact file SHA-256 match; final submit is rejected with RESOURCE_DUPLICATE.
    "existing_resources": [{
      "id": 0,
      "public_id": "string",
      "status": "string",
      "title": "string",
      "url": "string"
    }],
    "normalized": false, // Rotation/mirror normalized match; advisory only.
    "similar_resources": [{}],
    "structure": false // Exact schematic structure match; submit needs duplicate_note.
  },
  "expires_at": "string",
  "id": "string",
  "resource_kind": "string"
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/drafts" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "resource_kind=<resource_kind>" \
  -F "file=@/path/to/file"
```
