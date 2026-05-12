# MindForum 管理面板重构设计

## Context

当前管理面板仅有 4 个页面（仪表盘、分类管理、用户管理、帖子管理），功能有限：
- 仪表盘数据全部硬编码（'--'），未对接后端 API
- 缺少站点设置（基本信息、公告、显示、SEO）
- 缺少内容管理（标签管理、批量操作、审核队列）
- 缺少系统配置（发帖规则、限流、封禁、数据清理）
- 所有配置数据需要持久化到 SQLite 数据库

视觉设计采用黑白灰配色方案，Unicode 几何符号作为图标，呈现高端质感。

## 架构

### 数据库：settings 表

新增 `settings` 表存储所有可配置项，采用 key-value 结构：

```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Category 分组：`basic`, `announce`, `display`, `seo`, `rules`, `rate_limit`, `cleanup`

初始种子数据示例：
| key | value | category |
|-----|-------|----------|
| site_name | MindForum | basic |
| site_tagline | Share ideas, exchange experience | basic |
| site_description | ... | basic |
| site_logo_url | /logo.png | basic |
| site_footer | © 2026 MindForum | basic |
| announce_enabled | true | announce |
| posts_per_page | 20 | display |
| default_sort | newest | display |
| replies_per_page | 50 | display |
| seo_title_suffix | \| MindForum | seo |
| seo_default_description | ... | seo |
| seo_og_image | | seo |
| seo_sitemap_enabled | true | seo |
| seo_robots_enabled | true | seo |
| title_min_length | 2 | rules |
| title_max_length | 200 | rules |
| content_min_length | 10 | rules |
| max_tags_per_post | 5 | rules |
| max_tag_length | 30 | rules |
| rate_post_max | 10 | rate_limit |
| rate_post_window_min | 60 | rate_limit |
| rate_reply_max | 30 | rate_limit |
| rate_reply_window_min | 60 | rate_limit |
| rate_reply_newuser_cooldown_sec | 300 | rate_limit |
| rate_login_max | 5 | rate_limit |
| rate_login_lock_min | 15 | rate_limit |
| rate_api_max | 100 | rate_limit |
| cleanup_log_retention_days | 90 | cleanup |
| cleanup_soft_delete_retention_days | 30 | cleanup |
| cleanup_session_ttl_hours | 24 | cleanup |

### 封禁表：bans

```sql
CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ban_type TEXT NOT NULL,         -- 'ip', 'ip_range', 'user'
    value TEXT NOT NULL,            -- IP地址 / CIDR / user_id
    reason TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bans_type ON bans(ban_type);
CREATE INDEX IF NOT EXISTS idx_bans_active ON bans(is_active);
CREATE INDEX IF NOT EXISTS idx_bans_value ON bans(value);
```

### 后端 API

#### 新增端点

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/stats` | admin, moderator | 仪表盘统计数据 |
| GET | `/api/admin/settings` | admin | 获取所有设置（按 category 分组） |
| GET | `/api/admin/settings/:category` | admin | 获取单个分类的设置 |
| PUT | `/api/admin/settings/:category` | admin | 批量更新某个分类的设置 |
| GET | `/api/admin/users` | admin | 用户列表（分页、搜索） |
| GET | `/api/admin/posts` | admin, moderator | 帖子管理列表（分页、搜索、筛选） |
| DELETE | `/api/admin/posts` | admin, moderator | 批量删除帖子 |
| PUT | `/api/admin/posts/pin` | admin, moderator | 批量置顶 |
| PUT | `/api/admin/posts/move` | admin, moderator | 批量移动 |
| GET | `/api/admin/tags` | admin | 标签列表 |
| POST | `/api/admin/tags` | admin | 创建标签 |
| PUT | `/api/admin/tags/:id` | admin | 更新标签 |
| DELETE | `/api/admin/tags/:id` | admin | 删除标签 |
| POST | `/api/admin/tags/merge` | admin | 合并标签 |
| GET | `/api/admin/moderation` | admin, moderator | 待审核内容列表 |
| PUT | `/api/admin/moderation/:id/approve` | admin, moderator | 审核通过 |
| PUT | `/api/admin/moderation/:id/reject` | admin, moderator | 审核拒绝 |
| GET | `/api/admin/bans` | admin | 封禁列表 |
| POST | `/api/admin/bans` | admin | 新增封禁 |
| PUT | `/api/admin/bans/:id` | admin | 更新封禁 |
| DELETE | `/api/admin/bans/:id` | admin | 解除封禁 |
| POST | `/api/admin/cleanup/sessions` | admin | 手动清理过期会话 |
| POST | `/api/admin/cleanup/logs` | admin | 手动清理旧日志 |
| POST | `/api/admin/cleanup/soft-deleted` | admin | 手动清理软删除数据 |

#### GET /api/admin/stats 响应

```json
{
  "total_posts": 1247,
  "total_replies": 8932,
  "total_users": 342,
  "active_24h": 67,
  "today_posts": 23,
  "today_replies": 156,
  "today_users": 8,
  "activity_7d": [45, 62, 38, 71, 55, 80, 48]
}
```

#### 限流中间件

新增 `src/middleware/rate-limit.js`，从 settings 表读取限流配置：

```
rateLimit({
  key: 'post_create',
  max: settings.rate_post_max,       // 默认 10
  window: settings.rate_post_window_min * 60 * 1000,  // 默认 60min
  onExceed: 'error'                  // 返回 429
})
```

应用于：
- POST /posts — 发帖限流
- POST /posts/:id/replies — 回复限流
- POST /auth/login — 登录尝试限流
- 全局 API — API 请求频率限流

#### 封禁中间件

新增 `src/middleware/ban-check.js`，检查请求 IP 和用户是否在封禁列表中。

应用于所有 API 路由（在 authMiddleware 之后）。

### 前端页面结构

```
/admin
  layout.tsx                  # 已有，不变
  page.tsx                    # Dashboard — 真实数据
  /categories                 # 已有，视觉更新
  /users                      # 已有，视觉更新
  /posts                      # 已有，增加批量操作
  /logs                       # 已有，视觉更新
  /settings
    page.tsx                  # 重定向到 /settings/basic
    /basic/page.tsx           # 站点基本信息
    /announce/page.tsx        # 公告管理
    /display/page.tsx         # 显示设置
    /seo/page.tsx             # SEO 设置
  /content
    /tags/page.tsx            # 标签管理
    /moderation/page.tsx      # 审核队列
  /system
    /rules/page.tsx           # 发帖规则
    /rate-limits/page.tsx     # 限流设置
    /bans/page.tsx            # 封禁管理
    /cleanup/page.tsx         # 数据清理
```

### 侧边栏导航更新

```
Overview
  Dashboard

Site
  Basic Info
  Announcements (badge: 活跃数)
  Display
  SEO

Content
  Posts (已有)
  Tags
  Moderation (badge: 待审数)

System
  Posting Rules
  Rate Limits
  Bans
  Data Cleanup

Manage
  Categories (已有)
  Users (已有)
  Logs (已有)
```

### 设置读取机制

前端设置页面通过 `GET /api/admin/settings/:category` 加载数据，通过 `PUT /api/admin/settings/:category` 保存。

设置项在前端有默认值（fallback），即使数据库为空也能正常渲染。

后端 settings 模块提供 `SettingService.getByCategory(category)` 和 `SettingService.setBatch(category, keyValuePairs)` 方法。

### 前端数据获取策略

- Dashboard 统计数据：客户端获取（`useEffect` + `fetch`），每 60 秒刷新
- 设置页面：客户端表单，提交时调用更新 API
- 内容列表：客户端分页获取
- 审核队列：客户端获取，审核操作后即时刷新

### 权限

- 统计 API：admin + moderator 可见（moderator 只看内容相关统计）
- 设置 API：仅 admin
- 帖子管理 API：admin + moderator
- 封禁 API：仅 admin
- 清理 API：仅 admin

## 视觉规范

- 配色：黑白灰 (`--black: #0a0a0a` 到 `--white: #ffffff`)
- 图标：Unicode 几何符号（◈, ◼, ◻, ◇, △, ▭, ▣, ⊠, ⧫ 等），灰度滤镜
- 字体：大数值用 weight 200/300，标签用 weight 600 + uppercase + letter-spacing
- 分隔：1px border gap 替代 padding 间距
- 代码：ID、时间戳、IP 使用等宽字体
- 按钮：uppercase + letter-spacing
- 徽章：灰度色调（不再用彩色）

## 文件清单

### 数据库
- `src/database/schema.sql` — 新增 settings 表、bans 表及索引

### 后端新增
- `src/services/setting.service.js` — 设置 CRUD，按 category 分组
- `src/services/stat.service.js` — 统计数据聚合
- `src/services/ban.service.js` — 封禁 CRUD
- `src/middleware/rate-limit.js` — 限流中间件
- `src/middleware/ban-check.js` — 封禁检查中间件

### 后端修改
- `src/controllers/admin.controller.js` — 新增所有 admin API handler
- `src/routes/admin.routes.js` — 注册新路由
- `src/utils/constants.js` — 新增 settings 相关 LOG_ACTIONS

### 前端新增
- `frontend/src/app/admin/settings/layout.tsx` — 设置子布局（含子导航）
- `frontend/src/app/admin/settings/basic/page.tsx`
- `frontend/src/app/admin/settings/announce/page.tsx`
- `frontend/src/app/admin/settings/display/page.tsx`
- `frontend/src/app/admin/settings/seo/page.tsx`
- `frontend/src/app/admin/content/tags/page.tsx`
- `frontend/src/app/admin/content/moderation/page.tsx`
- `frontend/src/app/admin/system/rules/page.tsx`
- `frontend/src/app/admin/system/rate-limits/page.tsx`
- `frontend/src/app/admin/system/bans/page.tsx`
- `frontend/src/app/admin/system/cleanup/page.tsx`
- `frontend/src/lib/api/admin.ts` — Admin API 客户端（stats, settings, tags, moderation, bans, cleanup）

### 前端修改
- `frontend/src/components/admin/admin-sidebar.tsx` — 新增导航项
- `frontend/src/components/admin/dashboard.tsx` — 对接真实 API
- `frontend/src/app/admin/posts/page.tsx` — 增加批量操作
- `frontend/src/app/admin/users/page.tsx` — 改为 admin API
- `frontend/src/app/admin/logs/page.tsx` — 视觉更新
