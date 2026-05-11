# MindForum 第一阶段设计：基础设施加固

## Context

MindForum 论坛项目核心流程已跑通（认证→发帖→回复→管理），但存在基础设施缺陷：数据库操作缺少事务保护、索引不完整、API 路由缺少版本化、前端无错误处理、无 SEO 元数据、无缓存策略。本阶段聚焦打地基，不引入新功能。

## 数据库层

### schema.sql 重写

- 所有 FOREIGN KEY 添加 `ON DELETE CASCADE`（users→posts/replies/sessions/logs，posts→replies/post_tags，categories→posts）
- 补充缺失索引：`idx_tags_slug ON tags(slug)`、`idx_categories_slug ON categories(slug)`、`idx_posts_pinned_created ON posts(is_pinned DESC, created_at DESC)`
- `operation_logs` 添加复合索引 `idx_logs_user_action ON operation_logs(user_id, action)`
- `replies` 添加 `idx_replies_post_created ON replies(post_id, created_at)`

### 事务包裹

- `PostService.create`：帖子插入 + 标签附加在同一事务
- `PostService.update`：帖子更新 + 标签重绑在同一事务
- `PostService.pin` / `PostService.move`：直接返回事务内 getById
- `ReplyService.create`：回复插入在同一事务（当前单条，预留未来扩展）
- 数据库模块提供 `db.transaction(fn)` 封装

### operation_logs 自动清理

- `LogService.log` 写入后检查总行数，超过 10000 时 DELETE 最旧 5000 条
- 使用 `db.pragma('quick_check')` 验证数据完整性

### 迁移机制

- `database/index.js` 中 `try/catch ALTER` 改为版本号机制（`db_version` 表）
- 每次 schema 变更递增版本号，新数据库初始化时直接应用最新 schema

## API 层

### 路由版本化

- 新增 `/api/v1/` 前缀路由，在 `routes/index.js` 中创建 v1Router
- 所有现有路由在 v1Router 下注册一份（`/api/v1/posts`、`/api/v1/replies` 等）
- 旧路由（`/api/posts`）保留 6 个月过渡期，返回 `X-API-Version: legacy` 响应头
- v1 路由返回 `X-API-Version: 1` 响应头

### 统一响应格式

- 修复 controller 中直接 `ctx.body = { ... }` 的地方，统一走 `Response` 工具类
- `permission.js` 中的 401/403 响应改为调用 `Response.error`
- 错误处理中间件确保所有错误返回 `{ success: false, message: ..., code: ... }`

### 验证增强（middleware/validate.js）

- 帖子标题：1-200 字符，非空
- 帖子内容：最小 10 字符
- 回复内容：最小 1 字符
- 标签数量：最多 5 个，每个标签 1-30 字符
- 分类 slug：小写字母+数字+连字符
- 所有验证返回结构化错误：`{ success: false, errors: [{ field, message }] }`

### 修复 replies bug

- `post.controller.js:32`：`replies` 从硬编码 `[]` 改为调用 `ReplyService.getByPostId`
- 添加可选 query params `?replies_page=1&replies_limit=20` 控制回复分页

## 前端层

### 错误边界

- `frontend/src/app/error.tsx`：全局错误边界，显示错误信息 + 重试按钮
- `frontend/src/app/not-found.tsx`：404 页面，返回首页按钮

### Loading 组件

- `frontend/src/app/loading.tsx`：全局 skeleton，带脉动动画的卡片骨架
- `frontend/src/components/forum/post-skeleton.tsx`：帖子列表专用骨架
- `frontend/src/components/forum/post-detail-skeleton.tsx`：帖子详情专用骨架

### ISR 缓存

- `(public)/page.tsx`（首页帖子列表）：`revalidate: 30`
- `(public)/posts/[id]/page.tsx`（帖子详情）：`revalidate: 60`
- `(public)/categories/[id]/page.tsx`（分类页）：`revalidate: 300`
- 使用 Next.js 14 的 `fetch(url, { next: { revalidate, tags } })` API
- 发帖/更新/删除后调用 `revalidateTag('posts')` 和 `revalidateTag('post-{id}')`

### SEO Metadata

- `layout.tsx`：默认 metadata（title: "MindForum", description: "..."）
- `(public)/posts/[id]/page.tsx`：动态 `generateMetadata()` → `title: "${post.title} - MindForum"`
- `(public)/categories/[id]/page.tsx`：`generateMetadata()` → `title: "${category.name} - MindForum"`
- 所有页面添加 Open Graph 标签

## 文件清单

### 修改
- `src/database/schema.sql` — 重写，加 CASCADE/索引
- `src/database/index.js` — 迁移版本号机制
- `src/services/post.service.js` — 事务包裹
- `src/services/reply.service.js` — 事务包裹
- `src/services/log.service.js` — 自动清理
- `src/controllers/post.controller.js` — 统一响应 + 修复 replies
- `src/controllers/reply.controller.js` — 统一响应
- `src/controllers/admin.controller.js` — 统一响应
- `src/controllers/category.controller.js` — 统一响应
- `src/controllers/tag.controller.js` — 统一响应
- `src/middleware/permission.js` — 统一响应格式
- `src/middleware/validate.js` — 增强验证规则
- `src/routes/index.js` — v1 路由
- `src/routes/post.routes.js` — v1 路由注册
- `src/routes/reply.routes.js` — v1 路由注册
- `src/routes/category.routes.js` — v1 路由注册
- `src/routes/tag.routes.js` — v1 路由注册
- `src/routes/admin.routes.js` — v1 路由注册
- `src/routes/auth.routes.js` — v1 路由注册
- `frontend/src/app/(public)/page.tsx` — ISR + loading
- `frontend/src/app/(public)/posts/[id]/page.tsx` — ISR + metadata + 显示 replies
- `frontend/src/app/(public)/categories/[id]/page.tsx` — ISR + metadata
- `frontend/src/app/(public)/users/[id]/page.tsx` — 错误处理
- `frontend/src/app/(public)/tags/[slug]/page.tsx` — 错误处理
- `frontend/src/app/(auth)/login/page.tsx` — 错误处理
- `frontend/src/app/(auth)/callback/page.tsx` — 错误处理
- `frontend/src/lib/api/client.ts` — 版本号头 + tag 参数

### 新建
- `frontend/src/app/error.tsx` — 全局错误边界
- `frontend/src/app/not-found.tsx` — 404 页面
- `frontend/src/app/loading.tsx` — 全局 loading
- `frontend/src/components/forum/post-skeleton.tsx` — 列表骨架
- `frontend/src/components/forum/post-detail-skeleton.tsx` — 详情骨架

## 验证方案

1. 启动后端：`npm run dev`（端口 4000）
2. 启动前端：`cd frontend && npm run dev`（端口 3000）
3. 手动验证：
   - 访问首页，确认帖子列表正常加载
   - 访问帖子详情，确认回复正确显示（之前是空的）
   - 创建帖子，确认事务正常工作
   - 访问不存在的 URL，确认 404 页面
   - 查看 Network 面板，确认 `X-API-Version: 1` 响应头
4. 数据库验证：`sqlite3 data/forum.db ".schema"` 确认新索引和外键

## 第二阶段（后续轮次）

- 限流中间件
- 帖子搜索（FTS5）
- 点赞功能
- @提及通知
- Playwright Test 正式测试框架
