# UsersV1Controller_updateMe

> PUT /api/v1/me/profile · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`profile`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：180 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `PUT`

**地址：** `$FORUM_BASE_URL/api/v1/me/profile`

### 请求体

内容类型：`application/json`。

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 更新后的当前用户资料。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MeProfilePutResponse

```json
{
  "avatar_status": "string", // 头像审核状态。
  "avatar_url": "string", // 头像引用。绝对 URL 可直接使用；以 / 开头的站内路径须相对于请求所用的 API origin 解析。无头像时为 null。
  "bio": "string", // 个人简介。
  "created_at": "string", // 账号创建时间。
  "email_verified": false, // 邮箱是否已验证。
  "id": 0, // 当前论坛用户 ID。
  "permissions": {
    "message_read": {
      "allowed": false, // 当前是否允许执行该操作。
      "reason": "string" // 不可执行时的稳定原因码；允许时为 null。
    },
    "reply_create": {
      "allowed": false, // 当前是否允许执行该操作。
      "reason": "string" // 不可执行时的稳定原因码；允许时为 null。
    },
    "resource_upload": {
      "allowed": false, // 当前是否允许执行该操作。
      "reason": "string" // 不可执行时的稳定原因码；允许时为 null。
    },
    "thread_create": {
      "allowed": false, // 当前是否允许执行该操作。
      "reason": "string" // 不可执行时的稳定原因码；允许时为 null。
    }
  },
  "phone_verified": false, // 手机号是否已验证。
  "preferred_locale": "string", // 用户选择的界面语言。
  "role": "string", // 论坛角色。
  "username": "string", // 用户名。
  "verification": {
    "email": false, // 邮箱验证状态。
    "phone": false // 手机号验证状态。
  }
}
```

## 调用示例

```bash
curl --fail-with-body -X PUT \
  "$FORUM_BASE_URL/api/v1/me/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
