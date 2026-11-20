# ResourcesV1WriteController_create

> POST /api/v1/resources · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：5 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources`

### 请求头

| 请求头 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `Idempotency-Key` | 字符串 | 否 | ASCII key scoped to the authenticated user. Same key and request replay the original result for 24 hours; a changed payload returns IDEMPOTENCY_KEY_REUSED. |

### 表单参数

内容类型：`multipart/form-data`。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title` | 字符串 | 是 | - |
| `resource_type` | 字符串 | 是 | 可选值：upload / external |
| `resource_kind` | 字符串 | 否 | 可选值：mod / map / schematic / save / game_version / server_plugin / development_tool / texture_ui / pack / other |
| `version` | 字符串 | 是 | - |
| `description` | 字符串 | 否 | - |
| `duplicate_note` | 字符串 | 否 | Required when an exact schematic structure already exists; stored with the resource.；最长 2000 |
| `compatibility` | 数组 | 否 | Publisher-declared compatibility. Renderer facts remain separate and cannot be overwritten. |
| `content` | 字符串 | 否 | Legacy Markdown projection; kept for compatibility. |
| `content_json` | 对象 | 否 | Canonical Tiptap/ProseMirror document. Submitted as a JSON string in multipart requests. |
| `preview_draft_id` | 字符串 | 否 | - |
| `schematic_code` | 字符串 | 否 | - |
| `external_url` | 字符串（网址） | 否 | - |
| `file` | 文件 | 否 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | Submitted to moderation; same Idempotency-Key and request replay this result. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `409` | RESOURCE_DUPLICATE, RESOURCE_STRUCTURE_DUPLICATE, IDEMPOTENCY_KEY_REUSED, or IDEMPOTENCY_IN_PROGRESS. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesPostResponse

```json
{
  "created_at": "string",
  "public_id": "string",
  "status": "string",
  "title": "string"
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: <Idempotency-Key>" \
  -F "title=<title>" \
  -F "resource_type=<resource_type>" \
  -F "version=<version>" \
  # 可选字段：resource_kind、description、duplicate_note、compatibility、content、content_json、preview_draft_id、schematic_code、external_url、file
```
