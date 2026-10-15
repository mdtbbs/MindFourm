# BookmarksV1Controller_list

> GET /api/v1/me/bookmarks · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`forum.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/me/bookmarks`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | 数字 | 否 | 结果页码，从 1 开始；默认 1；最小 1 |
| `limit` | 数字 | 否 | 每页书签数；默认 20，最大 50；最小 1；最大 50 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 当前用户收藏的讨论摘要和分页。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MeBookmarksGetResponse

```json
{
  "items": [{
    "author_avatar_url": "string", // 作者头像 URL。
    "author_name": "string", // 作者用户名。
    "category_id": 0, // 分类 ID。
    "category_name": "string", // 分类名称。
    "category_slug": "string", // 分类 URL slug。
    "created_at": "string", // 发帖时间。
    "excerpt": "string", // 纯文本摘要。
    "id": 0, // 讨论 ID。
    "reply_count": 0, // 回复数。
    "tags": ["string"], // 帖子标签；当前收藏摘要返回空数组。
    "title": "string", // 讨论标题。
    "updated_at": "string", // 最后更新时间。
    "user_id": 0, // 作者论坛用户 ID。
    "view_count": 0 // 浏览次数。
  }], // 当前页收藏讨论。
  "pagination": {
    "limit": 0, // 每页条数。
    "page": 0, // 当前页。
    "total": 0, // 匹配的收藏总数。
    "total_pages": 0 // 总页数。
  }
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/me/bookmarks?page=<page>&limit=<limit>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
