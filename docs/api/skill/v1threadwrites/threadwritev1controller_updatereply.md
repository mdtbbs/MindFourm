# ThreadWriteV1Controller_updateReply

> PUT /api/v1/threads/{threadId}/replies/{replyId} · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`forum.write`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：180 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `PUT`

**地址：** `$FORUM_BASE_URL/api/v1/threads/{threadId}/replies/{replyId}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `threadId` | 数字 | 是 | - |
| `replyId` | 数字 | 是 | - |

### 请求体

内容类型：`application/json`。

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 回复已更新。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ThreadsThreadIdRepliesReplyIdPutResponse

```json
{
  "content": "string", // 纯文本兼容正文。
  "content_format": "string", // 正文规范。
  "content_html": "string", // 服务端生成的安全 HTML。
  "content_json": {}, // Rich Content Schema v2 文档。
  "content_schema_version": 0, // 富文本 Schema 版本。
  "content_text": "string", // 供搜索和纯文本客户端使用的正文投影。
  "created_at": "string", // 创建时间。
  "id": 0, // 新建或更新后的回复 ID。
  "parent_reply_id": 0, // 父回复 ID；直接回复讨论时为 null。
  "post_id": 0, // 所属讨论 ID。
  "status": "string", // 服务端实际保存状态，可能进入审核队列。
  "updated_at": "string" // 最后更新时间。
}
```

## 调用示例

```bash
curl --fail-with-body -X PUT \
  "$FORUM_BASE_URL/api/v1/threads/{threadId}/replies/{replyId}" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
