# ThreadsV1Controller_getThread

> GET /api/v1/threads/{id} · 契约：openapi-public-v1.json

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`forum.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/threads/{id}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 数字 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 讨论详情及当前查看者状态。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：forum.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ThreadsIdGetResponse

```json
{
  "author": {
    "avatar_url": "string", // 头像 URL。
    "id": 0, // 论坛用户 ID。
    "username": "string" // 用户名。
  },
  "author_avatar_url": "string", // 作者头像 URL。
  "author_mindauth_id": 0, // MindAuth 账号 ID。
  "author_name": "string", // 作者用户名。
  "author_role": "string", // 作者论坛角色。
  "best_reply_id": 0, // 被标记为最佳答案的回复 ID。
  "category": {
    "id": 0, // 分类 ID。
    "name": "string", // 分类名称。
    "slug": "string" // 分类 URL slug。
  },
  "category_color": "string", // 分类主题色。
  "category_icon": "string", // 分类图标标识。
  "category_id": 0, // 论坛分类 ID；未分类时为 null。
  "category_name": "string", // 分类名称。
  "category_slug": "string", // 分类 URL slug。
  "content": "string", // 纯文本兼容正文。
  "content_format": "string", // 正文规范。
  "content_html": "string", // 服务端生成的安全 HTML。
  "content_json": {}, // Rich Content Schema v2 文档。
  "content_schema_version": 0, // content_json 的 Schema 版本。
  "content_text": "string", // 供搜索和纯文本客户端使用的正文投影。
  "created_at": "string", // 创建时间（ISO 8601）。
  "edited_at": "string", // 最后编辑时间；未编辑时为 null。
  "excerpt": "string", // 正文纯文本摘要，最多约 180 个字符。
  "id": 0, // 讨论 ID。
  "is_locked": false, // 是否锁定，锁定后不能回复。
  "is_owner": false, // 当前用户是否为帖子作者。
  "is_pinned": false, // 是否置顶。
  "like_count": 0, // 点赞数。
  "location_label": "string", // 作者发布时的地区标签。
  "post_type": "string", // 帖子类型。
  "prefix": {
    "color": "string", // 前缀颜色。
    "label": "string", // 前缀显示名。
    "value": "string" // 前缀标识。
  },
  "public_id": "string", // 讨论稳定公开 ID；当前尚未分配，返回 null。
  "replies": [{
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
    "is_owner": false, // 当前用户是否为回复作者。
    "like_count": 0, // 点赞数。
    "location_label": "string", // 作者发布时的地区标签。
    "parent_reply_id": 0, // 父回复 ID；直接回复讨论时为 null。
    "post_id": 0, // 所属讨论 ID。
    "status": "string", // 回复状态。
    "updated_at": "string", // 最后更新时间（ISO 8601）。
    "user_id": 0 // 作者的论坛用户 ID。
  }], // 详情附带的首批回复；继续翻页请使用独立回复列表接口。
  "reply_count": 0, // 回复数量。
  "reply_pagination": {
    "limit": 0, // 每页条数。
    "page": 0, // 当前页。
    "total": 0, // 回复总数。
    "total_pages": 0 // 总页数。
  },
  "required_group_id": 0, // 可见用户组限制；无额外限制时为 null。
  "server_id": 0, // 关联游戏服务器 ID。
  "slug": "string", // 标题 URL slug；可能为空。
  "status": "string", // 帖子状态。公开列表仅返回可见内容。
  "tags": [{
    "created_at": "string", // 标签创建时间。
    "id": 0, // 标签 ID。
    "name": "string", // 标签名称。
    "slug": "string" // 标签 URL slug。
  }], // 帖子标签。
  "title": "string", // 讨论标题。
  "updated_at": "string", // 最后更新时间（ISO 8601）。
  "user_id": 0, // 作者的论坛用户 ID。
  "view_count": 0, // 浏览次数。
  "viewer": {
    "bookmarked": false, // 当前用户是否已收藏。
    "liked": false // 当前用户是否已点赞。
  }
}
```

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/threads/{id}" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
