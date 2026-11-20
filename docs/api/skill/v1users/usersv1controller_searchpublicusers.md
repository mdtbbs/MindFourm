# UsersV1Controller_searchPublicUsers

> GET /api/v1/users/search · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`friends.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：30 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/users/search`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `q` | 字符串 | 是 | 按用户名搜索；最短 1；最长 100 |
| `limit` | 数字 | 否 | 最多返回数量，默认 10，最大 50；最小 1；最大 50 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 标准成功信封；data 是不含调用者自身、好友及屏蔽用户的公开用户数组。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1UsersSearchGetResponse

```json
{
  "data": [{
    "avatar_status": "string", // 头像审核状态。
    "avatar_url": "string", // 头像引用。绝对 URL 可直接使用；以 / 开头的站内路径须相对于请求所用的 API origin 解析。无头像时为 null。
    "bio": "string", // 个人简介。
    "created_at": "string", // 账号创建时间。
    "id": 0, // 论坛用户 ID。
    "post_count": 0, // 讨论数。
    "reply_count": 0, // 回复数。
    "role": "string", // 论坛角色。
    "username": "string" // 用户名。
  }],
  "meta": {
    "request_id": "string"
  }
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/users/search?q=<q>&limit=<limit>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
