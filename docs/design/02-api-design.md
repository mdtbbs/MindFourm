# API 接口设计

> 本文档记录了论坛系统的 API 接口设计方案。
> 创建时间: 2026-06-07

## 技术选型

| 项目 | 选择 |
|------|------|
| 后端框架 | NestJS + TypeScript |
| 协议 | RESTful API |
| 认证 | MindAuth OAuth + JWT |
| 文档 | Swagger |
| 分页 | Cursor-based + Offset-based |

---

## 认证模块 `/api/auth`

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/callback` | OAuth 回调 |
| POST | `/verify` | 验证会话 |
| POST | `/logout` | 登出 |

---

## 帖子模块 `/api/posts`

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/` | 帖子列表（分页 + 排序：最新/最热/精华/我的） |
| GET | `/:id` | 帖子详情（含内容、作者、投票、附件） |
| POST | `/` | 创建帖子（标题+正文+分类+标签+封面图+权限设置+目录） |
| PUT | `/:id` | 更新帖子 |
| DELETE | `/:id` | 删除帖子 |
| GET | `/:id/edits` | 编辑历史 |
| GET | `/:id/toc` | 获取帖子目录 |

### 帖子投票 `/api/posts/:id/poll`

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/results` | 投票结果（单选/多选 + 公开结果） |
| POST | `/vote` | 提交投票 |

### 帖子附件 `/api/posts/:id/attachments`

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/` | 附件列表 |
| POST | `/upload` | 上传附件（支持批量 + 断点续传） |
| GET | `/:attachmentId/download` | 下载附件 |
| DELETE | `/:attachmentId` | 删除附件 |

---

## 回复模块 `/api/replies`

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/post/:postId` | 回复列表（分页，每页 20 条，2 层嵌套） |
| POST | `/post/:postId` | 创建回复（支持引用 + @提及） |
| PUT | `/:id` | 更新回复 |
| DELETE | `/:id` | 删除回复 |
| GET | `/:id/edits` | 回复编辑历史 |

---

## 用户模块 `/api/users`

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/me` | 当前用户信息 |
| PUT | `/me/profile` | 更新个人资料 |
| POST | `/me/avatar` | 上传头像 |
| GET | `/me/points` | 我的积分 |
| GET | `/me/badges` | 我的徽章 |
| GET | `/me/reputation` | 我的声望 |
| GET | `/me/stats` | 我的统计（发帖数/回复数/获赞数/积分排名） |
| GET | `/search` | 搜索用户（@提及） |
| GET | `/:id` | 用户公开资料 |
| GET | `/:id/posts` | 用户帖子列表 |
| GET | `/:id/followers` | 粉丝列表 |
| GET | `/:id/following` | 关注列表 |
| POST | `/:id/follow` | 关注用户 |
| DELETE | `/:id/follow` | 取消关注 |

---

## 通知模块 `/api/notifications`

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/` | 通知列表 |
| GET | `/unread-count` | 未读数量 |
| PUT | `/:id/read` | 标记已读 |
| PUT | `/read-all` | 全部标记已读 |
| POST | `/email-preference` | 邮件通知偏好设置 |

### SSE 实时推送

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/events` | SSE 连接端点 |

---

## 举报模块 `/api/reports`

| Method | Endpoint | 说明 |
|--------|----------|------|
| POST | `/` | 提交举报（原因+描述） |
| GET | `/my` | 我的举报列表 + 进度跟踪 |
| GET | `/:id` | 举报详情 |

### 管理员举报处理

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/admin/reports` | 举报列表 |
| PUT | `/admin/reports/:id/process` | 处理举报（通过/驳回/封禁） |
| GET | `/admin/content-flags` | 内容审核记录 |

---

## 分类与标签

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/categories` | 分类列表 |
| GET | `/categories/:slug/posts` | 分类下帖子 |
| GET | `/tags` | 标签列表 |
| GET | `/tags/:slug/posts` | 标签下帖子 |

---

## 点赞与收藏

| Method | Endpoint | 说明 |
|--------|----------|------|
| POST | `/posts/:id/like` | 点赞帖子 |
| DELETE | `/posts/:id/like` | 取消点赞 |
| POST | `/posts/:id/bookmark` | 收藏帖子 |
| DELETE | `/posts/:id/bookmark` | 取消收藏 |
| GET | `/bookmarks` | 我的收藏列表 |

---

## 私信模块 `/api/messages`

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/groups` | 私信列表 |
| POST | `/groups` | 创建私信对话 |
| GET | `/groups/:id/messages` | 消息列表 |
| POST | `/groups/:id/messages` | 发送消息 |
| PUT | `/groups/:id/read` | 标记已读 |

---

## 管理后台 `/api/admin`

### 仪表盘

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/dashboard` | 统计数据（新增用户/帖子/回复 + 7天趋势 + 热门分类 + 活跃排行） |

### 用户管理

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/users` | 用户列表 + 搜索 |
| GET | `/users/:id` | 用户详情 |
| PUT | `/users/:id/role` | 分配角色 |
| PUT | `/users/:id/ban` | 封禁 |
| PUT | `/users/:id/unban` | 解封 |
| POST | `/users/batch` | 批量操作 |
| GET | `/users/:id/logs` | 用户操作日志 |
| PUT | `/users/:id/points` | 积分调整 |

### 帖子管理

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/posts` | 帖子列表 |
| PUT | `/posts/:id/status` | 更新状态 |
| PUT | `/posts/pin` | 置顶 |
| DELETE | `/posts/:id` | 删除 |

### 系统配置

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/settings` | 所有配置 |
| GET/PUT | `/settings/:key` | 单个配置 |
| PUT | `/settings/bulk` | 批量更新 |

### 公告管理

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/announcements` | 公告列表 |
| POST | `/announcements` | 创建公告 |
| PUT | `/announcements/:id` | 更新公告 |
| DELETE | `/announcements/:id` | 删除公告 |

### 敏感词管理

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/sensitive-words` | 敏感词列表 |
| POST | `/sensitive-words` | 添加敏感词 |
| POST | `/sensitive-words/batch` | 批量导入 |
| PUT | `/sensitive-words/:id` | 更新敏感词 |
| DELETE | `/sensitive-words/:id` | 删除敏感词 |

### 用户等级/组

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET/POST/PUT/DELETE | `/levels` | 用户等级 CRUD |
| GET/POST/PUT/DELETE | `/groups` | 用户组 CRUD |
| POST | `/groups/:id/members` | 添加成员 |
| DELETE | `/groups/:id/members/:userId` | 移除成员 |

### 积分商城

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET/POST/PUT/DELETE | `/shop/items` | 商品 CRUD |
| GET | `/shop/orders` | 兑换记录 |

### 插件管理

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/plugins` | 已安装插件列表 |
| POST | `/plugins/install` | 上传安装 |
| PUT | `/plugins/:id/activate` | 启用 |
| PUT | `/plugins/:id/deactivate` | 禁用 |
| DELETE | `/plugins/:id` | 卸载 |
| GET/PUT | `/plugins/:id/config` | 插件配置 |
| GET | `/plugins/:id/hooks` | 插件钩子列表 |

---

## RSS

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/rss/posts` | 最新帖子 RSS |
| GET | `/rss/posts/:categoryId` | 分类帖子 RSS |

---

## 错误响应格式

```json
{
  "code": "ERROR_CODE",
  "message": "错误描述",
  "details": {}
}
```

## 成功响应格式

```json
{
  "data": {},
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```
