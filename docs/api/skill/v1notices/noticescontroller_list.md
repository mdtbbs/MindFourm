# NoticesController_list

> GET /api/v1/notices · 契约：openapi-public-v1.json

## 认证与权限

- 认证：公开；无需 access token。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/notices`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | 数字 | 否 | 每页公告数；默认 20，最大 50；最小 1；最大 50 |
| `offset` | 数字 | 否 | 从列表开头跳过的公告数；最小 0 |
| `pinned` | 字符串 | 否 | 只看置顶公告（true）或非置顶公告（false）；可选值：true / false |
| `type` | 字符串 | 否 | 按公告类型筛选；可选值：system / maintenance / event / policy / release |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 已发布公告列表；游标与计数信息嵌套在 data.pagination。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1NoticesGetResponse

```json
{
  "data": [{
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
  }], // 当前页公告。
  "pagination": {
    "has_more": false, // 是否还有下一页。
    "limit": 0, // 本页条数上限。
    "next_offset": 0, // 下一页起始位置；null 表示没有下一页。
    "offset": 0 // 当前起始偏移量。
  }
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/notices?limit=<limit>&offset=<offset>&pinned=<pinned>&type=<type>"
```
