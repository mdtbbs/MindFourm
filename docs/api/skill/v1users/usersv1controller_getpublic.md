# UsersV1Controller_getPublic

> GET /api/v1/users/{id} · 契约：openapi-public-v1.json

## 认证与权限

- 认证：公开；无需 access token。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/users/{id}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 数字 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 公开用户资料，不包含邮箱、手机号等私密字段。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1UsersIdGetResponse

```json
{
  "avatar_status": "string", // 头像审核状态。
  "avatar_url": "string", // 头像 URL。
  "bio": "string", // 个人简介。
  "created_at": "string", // 账号创建时间。
  "id": 0, // 论坛用户 ID。
  "post_count": 0, // 讨论数。
  "reply_count": 0, // 回复数。
  "role": "string", // 论坛角色。
  "username": "string" // 用户名。
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/users/{id}"
```
