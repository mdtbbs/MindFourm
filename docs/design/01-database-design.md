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
| points | INT DEFAULT 0 | 积分 |
| reputation | INT DEFAULT 0 | 声望 |
| level | INT DEFAULT 1 | 等级 |
| profile_background | VARCHAR(500) | 主页背景 |
| custom_title | VARCHAR(100) | 自定义称号 |
| signature | TEXT | 签名档 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| last_active_at | TIMESTAMP | 最后活跃时间 |
| is_online | BOOLEAN DEFAULT FALSE | 在线状态 |
| status | ENUM | active/banned/deleted |

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
| id | INT PK | 自增主键 |
| user_id | INT FK | 作者 |
| category_id | INT FK | 分类 |
| title | VARCHAR(255) | 标题 |
| content | TEXT | 正文（Markdown） |
| cover_image | VARCHAR(500) | 封面图 |
| status | ENUM | draft/published/hidden/deleted |
| view_count | INT | 浏览量 |
| like_count | INT | 点赞数 |
| reply_count | INT | 回复数 |
| poll_id | INT FK | 关联投票 |
| is_pinned | BOOLEAN | 置顶 |
| is_featured | BOOLEAN | 精华 |
| visibility | ENUM | public/members_only/group_only |
| allowed_groups | JSON | 可见用户组 |
| toc | JSON | 手动目录结构 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### post_edits - 帖子编辑历史
#### replies - 回复表（支持 2 层嵌套 + 引用 + @提及）
#### reply_edits - 回复编辑历史

---

### 投票系统

#### polls - 投票表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| post_id | INT FK | |
| question | VARCHAR(255) | 投票问题 |
| allow_multiple | BOOLEAN | 是否多选 |
| end_at | TIMESTAMP | 截止时间 |

#### poll_options - 投票选项
#### poll_votes - 用户投票记录

---

### 附件系统

#### attachments - 附件表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| post_id | INT FK | 关联帖子 |
| reply_id | INT FK | 关联回复 |
| user_id | INT FK | 上传者 |
| file_name | VARCHAR(255) | 文件名 |
| file_path | VARCHAR(500) | 存储路径 |
| file_size | INT | 文件大小 |
| file_type | VARCHAR(50) | MIME 类型 |
| download_count | INT | 下载次数 |
| created_at | TIMESTAMP | |

---

### 用户激励

#### badges - 徽章定义表
#### user_badges - 用户徽章关联
#### reputation_logs - 声望记录表
#### points_logs - 积分记录表
#### points_rules - 积分规则表

---

### 通知系统（全渠道）

#### notifications - 通知表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| user_id | INT FK | 接收者 |
| type | ENUM | reply/mention/like/system/badge/report |
| title | VARCHAR(255) | |
| content | TEXT | |
| actor_id | INT FK | 触发者 |
| target_type | ENUM | post/reply/user/badge |
| target_id | INT | |
| is_read | BOOLEAN | |
| email_sent | BOOLEAN | 是否已发送邮件通知 |
| created_at | TIMESTAMP | |

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

### 用户扩展

#### user_follows - 用户关注表
#### user_feeds - 用户动态表
#### user_titles - 用户头衔表（Discuz 风格）
#### user_title_assignments - 头衔分配表
#### user_social_links - 社交链接表
#### user_signatures - 签名档表
#### user_levels - 用户等级表
#### user_groups - 用户组表
#### user_group_members - 用户组成员表

---

### 私信系统

#### message_groups - 私信群聊表
#### message_group_members - 群聊成员表
#### group_messages - 群聊消息表
#### message_reads - 消息已读记录

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

#### statistics - 统计表
#### operation_logs - 操作日志表
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
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_category_id ON posts(category_id);
CREATE INDEX idx_posts_status_created ON posts(status, created_at DESC);
CREATE INDEX idx_replies_post_id ON replies(post_id);
CREATE INDEX idx_replies_user_id ON replies(user_id);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_users_online ON users(is_online, last_active_at);
CREATE INDEX idx_sensitive_word ON sensitive_words(word);
```
