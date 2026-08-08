# 社交与资源评论 API

后端全局前缀为 `/api`。成功响应由 `ResponseInterceptor` 统一包装为：

```json
{ "success": true, "data": {} }
```

下面示例中的 `data` 表示包装后的业务数据。除资源评论公开读取外，Presence 和好友接口都要求有效的 `forum_session`。

## Presence

### 批量查询在线状态

```http
GET /api/presence?user_ids=1,2,3
Cookie: forum_session=<session>
```

响应：

```json
{
  "success": true,
  "data": {
    "1": {
      "user_id": 1,
      "status": "online",
      "last_seen": "2026-08-09T02:00:00.000Z"
    }
  }
}
```

`user_ids` 是逗号分隔的正整数；无效或缺失时返回参数错误。Presence 查询是批量操作，前端应尽量合并用户 ID，避免逐用户请求。

在线状态写入和好友状态推送由 Presence 服务和外部/LanLink 集成负责。Redis 需要启用 keyspace notifications 才能推送好友在线状态变化。

## Friends

所有好友接口均需要登录。当前用户由 session 推断，不接受 body 中的 actor user id。

| Method | Endpoint | 说明 |
|---|---|---|
| POST | `/api/friends/request/:userId` | 发送好友请求 |
| POST | `/api/friends/accept/:userId` | 接受对方请求；参数是请求方用户 ID |
| POST | `/api/friends/reject/:userId` | 拒绝对方请求 |
| POST | `/api/friends/cancel/:userId` | 取消自己发出的请求 |
| DELETE | `/api/friends/:userId` | 删除好友 |
| GET | `/api/friends` | 分页获取好友列表 |
| GET | `/api/friends/requests` | 分页获取待处理请求 |
| GET | `/api/friends/search?q=...&limit=10` | 搜索非好友用户 |
| GET | `/api/friends/check/:userId` | 查询与目标用户的关系状态 |

分页请求使用：

```http
GET /api/friends/requests?page=1&limit=20
```

好友列表和请求列表返回业务分页对象，具体字段以当前响应中的 `data` 和 `pagination` 为准。

## Resource Comments

### 获取资源评论

```http
GET /api/resources/:resourceId/comments?page=1&limit=20
```

该读取接口公开可访问。评论按资源分页返回，并保留 `parent_id` 关系供前端构建嵌套树。

### 创建评论或回复

```http
POST /api/resources/:resourceId/comments
Cookie: forum_session=<session>
Content-Type: application/json

{
  "content": "这个资源在 1.6 版本可用",
  "parent_comment_id": 12
}
```

`parent_comment_id` 可省略表示顶级评论。当前请求用户由 session 推断。

### 编辑评论

```http
PUT /api/resource-comments/:id
Cookie: forum_session=<session>
Content-Type: application/json

{
  "content": "更新后的评论内容"
}
```

只能编辑有权限的自己的评论，最终权限由后端服务判断。

### 删除评论

```http
DELETE /api/resource-comments/:id
Cookie: forum_session=<session>
```

请求用户 ID 和角色由 session 注入；删除权限在服务层校验。

### 点赞 / 取消点赞

```http
POST /api/resource-comments/:id/like
Cookie: forum_session=<session>

DELETE /api/resource-comments/:id/like
Cookie: forum_session=<session>
```

响应为成功确认，评论详情中的计数由下一次读取反映。

## 错误处理

- 未登录：401。
- 参数校验失败：400。
- 目标资源或评论不存在：404。
- 无权限：403。
- 服务器错误由全局异常过滤器转换为统一错误响应，不向客户端暴露堆栈。
