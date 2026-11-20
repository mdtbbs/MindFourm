# TimelapsesController_draftPost

> POST /api/v1/timelapses/{id}/draft-post · 契约：openapi-public-v1.json

生成战报草稿帖

创建包含 battleReport 节点的帖子草稿，作者可继续编辑后发布。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`timelapse.write`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：10 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/timelapses/{id}/draft-post`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串 | 是 | 延时战报 public_id（UUID） |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "category_id": 0.0, // 论坛分类 ID；省略时使用站点默认分类。
  "title": "string" // 草稿标题；省略时根据地图名自动生成。
}
```

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
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/timelapses/{id}/draft-post" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "category_id": 0.0,
  "title": "string"
}
JSON
```
