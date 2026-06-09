# 数据库架构设计

> 本文档记录了论坛系统的数据库设计方案，由团队讨论确认。
> 创建时间: 2026-06-07

## 技术选型

| 项目 | 选择 |
|------|------|
| 主数据库 | MySQL 8 |
| 缓存/会话 | Redis 7 |
| ORM | TypeORM |
| 字符集 | utf8mb4 / utf8mb4_unicode_ci |

> **注意**：本系统使用 TypeORM 实体类定义数据库结构，而非原生 SQL。本文档展示的是等效的 MySQL 表结构供参考。所有外键约束使用 `ON DELETE CASCADE`。

---

## 核心表设计

### 用户与权限（RBAC）

#### users - 用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 自增主键 |
| mindauth_id | VARCHAR(255) UNIQUE | MindAuth 用户 ID |
| username | VARCHAR(50) UNIQUE | 用户名 |
| email | VARCHAR(255) UNIQUE | 邮箱 |
| avatar_url | VARCHAR(500) | 头像 URL |
| bio | TEXT | 个人简介 |
| role | ENUM | user/moderator/admin |
| profile_background | VARCHAR(500) | 主页背景 |
| custom_title | VARCHAR(100) | 自定义称号 |
| signature | TEXT | 签名档 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| last_active_at | TIMESTAMP | 最后活跃时间 |
| is_online | BOOLEAN DEFAULT FALSE | 在线状态 |
| status | ENUM | active/banned/deleted |

> **注意**：积分(points)、声望(reputation)、等级(level)字段已移除，徽章/等级系统未实现。

#### roles - 角色表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 自增主键 |
| name | VARCHAR(50) UNIQUE | 角色标识 |
| display_name | VARCHAR(100) | 显示名称 |
| description | TEXT | 描述 |
| is_system | BOOLEAN | 系统内置角色 |

#### permissions - 权限表
25+ 预定义权限节点，覆盖：post_*, reply_*, user_*, category_*, system_*, report_*

#### role_permissions - 角色权限关联
#### user_roles - 用户角色关联（支持临时角色）
#### moderator_assignments - 版主板块分配

---

### 内容相关

#### posts - 帖子表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK | 自增主键（高流量表使用 BIGINT） |
| user_id | INT FK | 作者（ON DELETE CASCADE） |
| category_id | INT FK | 分类（ON DELETE CASCADE） |
| title | VARCHAR(255) | 标题 |
| content | TEXT | 正文（Markdown） |
| cover_image | VARCHAR(500) | 封面图 |
| status | ENUM | draft/published/hidden/deleted |
| view_count | INT | 浏览量 |
| like_count | INT | 点赞数 |
| reply_count | INT | 回复数 |
| is_pinned | BOOLEAN | 置顶 |
| is_featured | BOOLEAN | 精华 |
| visibility | ENUM | public/members_only/group_only |
| allowed_groups | JSON | 可见用户组 |
| toc | JSON | 手动目录结构 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP | 软删除时间（@DeleteDateColumn） |

> **注意**：`poll_id` 字段已移除，投票系统未实现。帖子使用 `@DeleteDateColumn` 实现软删除。

#### replies - 回复表（支持 2 层嵌套 + 引用 + @提及）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK | 自增主键（高流量表使用 BIGINT） |
| post_id | INT FK | 关联帖子（ON DELETE CASCADE） |
| user_id | INT FK | 作者（ON DELETE CASCADE） |
| parent_reply_id | BIGINT FK | 父回复（ON DELETE CASCADE，支持嵌套） |
| content | TEXT | 回复内容（Markdown） |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP | 软删除时间（@DeleteDateColumn） |

> **注意**：回复同样使用软删除。`post_edits` 和 `reply_edits` 编辑历史表已移除，编辑历史未实现。

---

### ~~投票系统~~（未实现）

> **注意**：投票系统（polls、poll_options、poll_votes）已规划但未实现。如需实现，请参考原设计文档。

---

### 附件系统

#### attachments - 附件表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| target_type | ENUM | 关联类型：'post' 或 'reply'（TODO：待重构） |
| target_id | INT | 关联 ID（帖子或回复的 ID） |
| user_id | INT FK | 上传者（ON DELETE CASCADE） |
| file_name | VARCHAR(255) | 文件名 |
| file_path | VARCHAR(500) | 存储路径 |
| file_size | INT | 文件大小 |
| file_type | VARCHAR(50) | MIME 类型 |
| download_count | INT | 下载次数 |
| created_at | TIMESTAMP | |

> **TODO**：当前实现使用 `target_type ENUM('post', 'reply')` + `target_id` 模式，而非单独的 `post_id` 和 `reply_id` 外键。这种模式更灵活，避免了多个可空外键的问题。

---

### ~~用户激励~~（未实现）

> **注意**：以下表已规划但未实现：
> - `badges` - 徽章定义表
> - `user_badges` - 用户徽章关联
> - `reputation_logs` - 声望记录表
> - `points_logs` - 积分记录表
> - `points_rules` - 积分规则表
> 
> 共享组件包中有 `Medal` 和 `Title` 组件用于显示用户头衔，但积分/徽章系统未实现。

---

### 通知系统（全渠道）

#### notifications - 通知表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK | 自增主键（高流量表使用 BIGINT） |
| user_id | INT FK | 接收者（ON DELETE CASCADE） |
| type | ENUM | reply/mention/like/system/report |
| title | VARCHAR(255) | |
| content | TEXT | |
| actor_id | INT FK | 触发者（ON DELETE CASCADE） |
| target_type | ENUM | post/reply/user |
| target_id | INT | |
| is_read | BOOLEAN | |
| email_sent | BOOLEAN | 是否已发送邮件通知 |
| created_at | TIMESTAMP | |

> **注意**：`badge` 类型已移除，徽章系统未实现。

---

### 举报系统（完整流程）

#### reports - 举报表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| reporter_id | INT FK | 举报者 |
| target_type | ENUM | post/reply/user |
| target_id | INT | |
| reason | ENUM | spam/harassment/inappropriate/misinformation/other |
| description | TEXT | |
| status | ENUM | pending/processing/resolved/dismissed |
| handler_id | INT FK | 处理者 |
| result | TEXT | 处理结果 |
| reporter_notified | BOOLEAN | 是否已通知举报者 |
| created_at | TIMESTAMP | |
| resolved_at | TIMESTAMP | |

---

### 系统配置

#### settings - 系统设置表（KV 存储）
分类：basic / seo / email / auth / content / points / system

#### announcements - 公告表
#### forum_rules - 论坛规则表
#### sensitive_words - 敏感词表（DFA 词树）
#### content_flags - 内容审核记录

---

### 插件系统

#### plugins - 插件表
#### plugin_configs - 插件配置表
#### plugin_hooks - 插件钩子注册表（before/after/filter）
#### plugin_permissions - 插件权限表
#### plugin_market - 插件市场缓存表

---

### ~~用户扩展~~（未实现）

> **注意**：以下表已规划但未实现：
> - `user_follows` - 用户关注表
> - `user_feeds` - 用户动态表
> - `user_titles` - 用户头衔表
> - `user_title_assignments` - 头衔分配表
> - `user_social_links` - 社交链接表
> - `user_signatures` - 签名档表
> - `user_levels` - 用户等级表
> - `user_groups` - 用户组表
> - `user_group_members` - 用户组成员表

---

### 私信系统

#### messages - 私信表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK | 自增主键（高流量表使用 BIGINT） |
| sender_id | INT FK | 发送者（ON DELETE CASCADE） |
| recipient_id | INT FK | 接收者（ON DELETE CASCADE） |
| content | TEXT | 消息内容 |
| is_read | BOOLEAN | 是否已读 |
| created_at | TIMESTAMP | |

> **注意**：群聊功能未实现，仅支持一对一私信。

---

### 收藏系统

#### bookmarks - 收藏表
#### bookmark_categories - 收藏分类表
#### bookmark_category_items - 收藏分类关联表

---

### SEO 与装饰

#### categories - 分类表
#### tags - 标签表
#### post_tags - 帖子标签关联表
#### category_decorations - 板块装饰表
#### content_markers - 内容标记表
#### seo_metadata - SEO 元数据表

---

### 统计与日志

#### operation_logs - 操作日志表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK | 自增主键（高流量表使用 BIGINT） |
| user_id | INT FK | 操作者（ON DELETE CASCADE） |
| action | VARCHAR(50) | 操作类型 |
| target_type | VARCHAR(50) | 目标类型 |
| target_id | INT | 目标 ID |
| details | JSON | 操作详情 |
| ip_address | VARCHAR(45) | IP 地址 |
| user_agent | VARCHAR(500) | 用户代理 |
| created_at | TIMESTAMP | |

> **注意**：操作日志存储在 MySQL 数据库中，保留 90 天。通过 `POST /admin/cleanup/logs` 接口清理旧日志。

#### session_audit - 会话审计表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK | 自增主键 |
| session_token | VARCHAR(255) | 会话令牌 |
| user_id | INT FK | 用户 ID（ON DELETE CASCADE） |
| action | ENUM | login/logout/token_refresh |
| ip_address | VARCHAR(45) | IP 地址 |
| created_at | TIMESTAMP | |

> **注意**：用于追踪用户登录/登出行为，增强安全审计。

#### statistics - 统计表
#### search_history - 搜索历史表
#### popular_searches - 热门搜索表
#### online_sessions - 在线会话表
#### bot_detection_logs - 机器人检测表
#### ip_blacklist - IP 黑名单表

---

## Redis 使用

| Key 模式 | 类型 | 用途 |
|----------|------|------|
| session:{token} | STRING | 用户会话 |
| user:permissions:{id} | STRING | 权限缓存 |
| setting:{key} | STRING | 设置缓存 |
| online_users | SET | 在线用户集合 |
| user_last_active | HASH | 最后活跃时间 |
| rate_limit:{ip} | STRING | 频率限制 |

---

## 索引设计

```sql
-- 帖子表索引
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_category_id ON posts(category_id);
CREATE INDEX idx_posts_status_created ON posts(status, created_at DESC);
CREATE INDEX idx_posts_is_pinned ON posts(is_pinned, created_at DESC);

-- 回复表索引
CREATE INDEX idx_replies_post_id ON replies(post_id);
CREATE INDEX idx_replies_user_id ON replies(user_id);
CREATE INDEX idx_replies_parent ON replies(post_id, parent_reply_id);
CREATE INDEX idx_replies_created ON replies(post_id, created_at DESC);

-- 通知表索引
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- 消息表索引
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_unread ON messages(recipient_id, is_read);

-- 操作日志索引
CREATE INDEX idx_operation_logs_user ON operation_logs(user_id);
CREATE INDEX idx_operation_logs_action ON operation_logs(action);
CREATE INDEX idx_operation_logs_created ON operation_logs(created_at DESC);

-- 用户表索引
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_mindauth ON users(mindauth_id);
CREATE INDEX idx_users_online ON users(is_online, last_active_at);

-- 其他索引
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_sensitive_word ON sensitive_words(word);
```

## 外键约束说明

所有外键约束使用 `ON DELETE CASCADE`，当父记录被删除时自动删除关联记录：

```sql
-- 示例
ALTER TABLE posts ADD CONSTRAINT fk_posts_user 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE replies ADD CONSTRAINT fk_replies_post 
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

## 软删除实现

使用 TypeORM 的 `@DeleteDateColumn` 实现软删除：

```typescript
@Entity()
export class Post {
  // ... 其他字段
  
  @DeleteDateColumn()
  deletedAt: Date | null;
}
```

软删除的实体在查询时会自动被过滤，使用 `repository.find()` 不会返回已删除记录。如需包含已删除记录，使用 `withDeleted()` 方法。
