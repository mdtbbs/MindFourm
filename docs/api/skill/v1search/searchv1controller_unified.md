# SearchV1Controller_unified

> GET /api/v1/search · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`forum.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：30 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/search`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `resource_kind` | 字符串 | 否 | 资源子类型筛选；可选值：mod / map / schematic |
| `content_language` | 字符串 | 否 | 资源和帖子内容语言筛选；可选值：en / ru / ja / zh-CN |
| `limit` | 数字 | 否 | 每页结果数量；最小 1；最大 100 |
| `page` | 数字 | 否 | 结果页码，从 1 开始 |
| `sort` | 字符串 | 否 | 结果排序方式；可选值：relevance / newest / oldest / downloads / rating |
| `category` | 字符串 | 否 | 分类筛选标识 |
| `type` | 字符串 | 否 | 结果分组筛选；保留 post、user、global 历史值作为兼容别名；可选值：post / posts / user / users / global / all / resources / resource / mod / map / schematic / servers / server / wiki / game_versions / game_version / developer_feed |
| `q` | 字符串 | 是 | 搜索关键词；最长 255 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

> 契约未声明成功响应：该接口是否可用、返回什么，取决于站点策略与运行时状态。

调用方应按状态码分支处理，不要假设返回 JSON 结构。

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/search?resource_kind=<resource_kind>&content_language=<content_language>&limit=<limit>&page=<page>&sort=<sort>&category=<category>&type=<type>&q=<q>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
