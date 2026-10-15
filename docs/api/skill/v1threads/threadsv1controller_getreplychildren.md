# ThreadsV1Controller_getReplyChildren

> GET /api/v1/threads/{id}/replies/{replyId}/children · 契约：openapi-public-v1.json

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`forum.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/threads/{id}/replies/{replyId}/children`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 数字 | 是 | - |
| `replyId` | 数字 | 是 | - |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | 数字 | 否 | 每页子回复数，最多 50 |
| `page` | 数字 | 否 | 子回复页码，从 1 开始 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 当前回复的直接子回复；通过 child_count 继续展开，分页信息放在 meta.pagination。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：forum.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ThreadsIdRepliesReplyIdChildrenGetResponseItem数组

```json
[
{
    "author_avatar_url": "string", // 作者头像 URL。
    "author_mindauth_id": 0, // MindAuth 账号 ID。
    "author_name": "string", // 作者用户名。
    "author_role": "string", // 论坛角色。
    "child_count": 0, // 直接子回复数；通过子回复分页接口展开。
    "content": "string", // 纯文本兼容正文。
    "content_format": "string", // 正文规范。
    "content_html": "string", // 服务端生成的安全 HTML。
    "content_json": {}, // Rich Content Schema v2 文档。
    "content_schema_version": 0, // content_json 的 Schema 版本。
    "content_text": "string", // 供搜索和纯文本客户端使用的正文投影。
    "created_at": "string", // 创建时间（ISO 8601）。
    "id": 0, // 回复 ID。
    "like_count": 0, // 点赞数。
    "location_label": "string", // 作者发布时的地区标签。
    "parent_reply_id": 0, // 父回复 ID；直接回复讨论时为 null。
    "post_id": 0, // 所属讨论 ID。
    "status": "string", // 回复状态。
    "updated_at": "string", // 最后更新时间（ISO 8601）。
    "user_id": 0 // 作者的论坛用户 ID。
  }
]
```

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/threads/{id}/replies/{replyId}/children?limit=<limit>&page=<page>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
