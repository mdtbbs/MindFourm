# NoticesController_detail

> GET /api/v1/notices/{id} · 契约：openapi-public-v1.json

## 认证与权限

- 认证：公开；无需 access token。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/notices/{id}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 公告详情、修订记录和相关公告。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1NoticesIdGetResponse

```json
{
  "author": {
    "avatar_url": "string", // 头像 URL。
    "id": 0, // 用户 ID。
    "role": "string", // 论坛角色。
    "username": "string" // 用户名。
  },
  "content_html": "string", // 服务端渲染的安全 HTML。
  "content_markdown": "string", // 公告 Markdown 正文。
  "created_at": "string", // 创建时间。
  "edited_at": "string", // 最近编辑时间。
  "excerpt": "string", // 公告摘要。
  "id": 0, // 公告 ID；兼容期间可使用数据库 ID。
  "is_pinned": false, // 是否置顶。
  "notice_type": "string", // 公告类型。
  "public_id": "string", // 公告稳定公开标识。
  "published_at": "string", // 发布时间。
  "related": [{
    "author": {
      "avatar_url": "string", // 头像 URL。
      "id": 0, // 用户 ID。
      "role": "string", // 论坛角色。
      "username": "string" // 用户名。
    },
    "edited_at": "string", // 最近编辑时间。
    "excerpt": "string", // 公告摘要。
    "id": 0, // 公告 ID；兼容期间可使用数据库 ID。
    "is_pinned": false, // 是否置顶。
    "notice_type": "string", // 公告类型。
    "public_id": "string", // 公告稳定公开标识。
    "published_at": "string", // 发布时间。
    "slug": "string", // 公告 URL slug。
    "title": "string", // 公告标题。
    "view_count": 0 // 浏览次数。
  }], // 同类型的相关公告摘要。
  "revisions": [{
    "change_summary": "string", // 编辑者填写的修改摘要。
    "created_at": "string", // 修订时间。
    "editor": {}, // 修订者公开资料。
    "id": 0 // 修订记录 ID。
  }], // 最近 10 条修订记录。
  "slug": "string", // 公告 URL slug。
  "status": "string", // 公告状态。公开详情只允许读取已发布公告。
  "title": "string", // 公告标题。
  "updated_at": "string", // 最后更新时间。
  "view_count": 0 // 浏览次数。
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/notices/{id}"
```
