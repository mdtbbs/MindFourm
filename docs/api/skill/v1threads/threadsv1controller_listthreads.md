# ThreadsV1Controller_listThreads

> GET /api/v1/threads · 契约：openapi-public-v1.json

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`forum.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/threads`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `order` | 字符串 | 否 | cursor 模式排序方向；默认 DESC；可选值：ASC / DESC |
| `server_id` | 数字 | 否 | cursor 模式下按关联游戏服务器筛选；最小 1 |
| `content_language` | 字符串 | 否 | cursor 模式下按作者声明的内容语言筛选；最长 16 |
| `user_id` | 数字 | 否 | cursor 模式下只读取指定作者的讨论；最小 1 |
| `exclude_category_ids` | 字符串 | 否 | cursor 模式下排除分类 ID，多个 ID 用逗号分隔 |
| `source` | 字符串 | 否 | cursor 模式下按帖子来源筛选；可选值：USER / SYSTEM / GITHUB_ISSUE / GITHUB_PR / RSS / IMPORT / API |
| `cursor` | 字符串 | 否 | 启用 cursor 分页并传入上一页 data.next_cursor；首次 cursor 请求传空 cursor。与 offset/page 搜索模式分开使用 |
| `sort` | 字符串 | 否 | q 搜索可用 relevance、newest、oldest；cursor 列表可用 created_at、updated_at、view_count、like_count |
| `q` | 字符串 | 否 | 按帖子标题和正文搜索；此模式使用 page/limit 分页；最长 200 |
| `page` | 数字 | 否 | offset 模式中用于计算起始位置的页码；q 搜索时作为结果页码；最小 1 |
| `category_id` | 数字 | 否 | 按论坛分类 ID 筛选；最小 1 |
| `offset` | 数字 | 否 | 传统分页的起始偏移量；不传时由 page 计算；最小 0 |
| `limit` | 数字 | 否 | 每页最多返回条数，默认 20、上限 50；最小 1；最大 50 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | offset / 搜索模式返回讨论数组和 meta.pagination；cursor 模式返回 items、next_cursor、has_more。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：forum.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** 以下两种形态之一

该接口按查询参数返回两种分页形态中的一种：

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/threads?order=<order>&server_id=<server_id>&content_language=<content_language>&user_id=<user_id>&exclude_category_ids=<exclude_category_ids>&source=<source>&cursor=<cursor>&sort=<sort>&q=<q>&page=<page>&category_id=<category_id>&offset=<offset>&limit=<limit>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
