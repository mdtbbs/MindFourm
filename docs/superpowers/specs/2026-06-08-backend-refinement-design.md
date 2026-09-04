# 后端功能细化设计

> 创建时间: 2026-06-08
> 状态: 设计完成，待实现

## 概述

在已完成核心开发的基础上（28 个模块 + 50+ 前端页面），对以下 4 个后端功能进行细化完善。

---

## 1. 帖子 @提及通知

### 问题

- `posts.service.ts` 创建帖子时不解析 @username 并发送通知
- `replies.service.ts` 已通过 `notificationsService.notifyMentionedUsers()` 处理 @提及
- 设计文档要求：帖子和回复的 @提及行为一致

### 方案

在 `posts.service.ts` 的 `create()` 方法中，帖子状态为 `published` 时调用 `notifyMentionedUsers()`。

### 实现要点

- 注入 `NotificationsService` 到 PostsService（当前只注入了 EventBusService）
- 在事务提交后、`post.created` 钩子之前调用
- 解析 `dto.content` 中的 `@(\w+)` 模式
- 传递 `skipUserIds: [userId]` 避免通知自己

### 影响范围

- `src/modules/posts/posts.service.ts` — 注入 NotificationsService，create 方法添加 @提及处理
- `src/modules/posts/posts.module.ts` — 确保 NotificationsModule 已导入（已有）

---

## 2. 搜索历史 + 热门搜索

### 问题

- 当前搜索仅支持 MySQL LIKE 查询
- 无用户搜索历史记录
- 无热门搜索词推荐
- 无搜索结果缓存

### 方案

#### 2.1 数据库表

| 表 | 用途 |
|---|---|
| `search_history` | 记录用户搜索行为（query, type, results_count, created_at） |
| `popular_searches` | 热门搜索词统计（query, count, last_searched_at） |

#### 2.2 实体

```typescript
// SearchHistory entity
@Index(['user_id', 'created_at'])
@Index(['query'])
```

#### 2.3 API 端点

| 端点 | 权限 | 说明 |
|------|------|------|
| `GET /api/search?q=&type=&page=&limit=` | Public | 全局搜索（帖子 + 用户） |
| `GET /api/search/history` | Auth | 当前用户最近搜索 |
| `GET /api/search/popular` | Public | Top 10 热门搜索词 |
| `DELETE /api/search/history/:id` | Auth | 删除单条搜索历史 |
| `DELETE /api/search/history` | Auth | 清空搜索历史 |

#### 2.4 缓存策略

| 缓存内容 | TTL | 键模式 |
|---------|-----|--------|
| 热门搜索列表 | 5 分钟 | `search:popular` |
| 搜索结果（精确匹配） | 1 分钟 | `search:exact:{query}` |

#### 2.5 热门搜索更新逻辑

1. 搜索请求到达 → 检查缓存
2. 执行 LIKE 查询 → 返回结果
3. 异步记录搜索历史 → 更新 Redis ZSET（`search:popular`）
4. 定时任务（每分钟）→ 同步 Redis ZSET → `popular_searches` 表

### 影响范围

- `src/entities/search-history.entity.ts` — 新建
- `src/entities/popular-search.entity.ts` — 新建
- `src/modules/search/` — 新建 search 模块（controller + service + dto）
- `src/entities/index.ts` — 注册新实体
- `src/app.module.ts` — 注册 SearchModule
- `frontend/src/app/(public)/search/page.tsx` — 增加历史记录 + 热门搜索 UI
- 数据库迁移脚本

---

## 3. BullMQ 邮件队列升级

### 问题

- 当前 `email-queue.service.ts` 使用内存数组
- 服务重启 → 队列丢失
- 无并发控制
- 无任务持久化

### 方案

替换内存队列为 BullMQ Queue + Worker。

#### 3.1 依赖

```json
{
  "bullmq": "^5.x"
}
```

ioredis 已安装（`^5.4.1`），可直接复用。

#### 3.2 架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Notification│────▶│ BullMQ Queue │────▶│ BullMQ Worker│
│  Service    │     │ (Redis)      │     │ (Email Send) │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
                                          ┌─────▼─────┐
                                          │ Nodemailer │
                                          │  SMTP      │
                                          └───────────┘
```

#### 3.3 队列配置

| 参数 | 值 |
|------|---|
| 最大重试次数 | 3 |
| 退避策略 | 指数退避（1s → 2s → 4s） |
| 并发数 | 5（默认） |
| 任务超时 | 30s |
| 队列名称 | `email-queue` |

#### 3.4 实现要点

- `EmailQueueService` 改为 `OnModuleInit` + `OnModuleDestroy`
- `onModuleInit`: 创建 Queue 和 Worker
- `onModuleDestroy`: 关闭 Queue 和 Worker
- `addEmailJob()`: `queue.add('send-email', jobData, jobOptions)`
- Worker 处理函数: 调用 `EmailService.sendMail()`
- 保持现有 `getQueueSize()` API（改为 `queue.getJobCounts('waiting')`）

### 影响范围

- `src/modules/notifications/email-queue.service.ts` — 重写
- `package.json` — 添加 bullmq 依赖
- 现有调用方（NotificationsService）无需修改（接口不变）

---

## 4. Docker 完整部署配置

### 问题

- 无 Docker 配置文件
- 无 docker-compose 编排
- 无生产环境 Nginx 配置
- 无 SSL 配置

### 方案

#### 4.1 文件结构

```
MindFourm/
├── Dockerfile              # 后端生产镜像
├── docker-compose.dev.yml  # 本地开发
├── docker-compose.prod.yml # 生产部署
├── nginx/
│   ├── nginx.conf          # 主配置
│   └── conf.d/
│       └── default.conf    # 站点配置 + SSL
├── .dockerignore
└── docker/
    └── entrypoint.sh       # 数据库迁移 + 启动
```

#### 4.2 docker-compose.dev.yml

| 服务 | 端口 | 说明 |
|------|------|------|
| mysql | 3306 | MySQL 8 |
| redis | 6379 | Redis 7 |
| backend | 4000 | NestJS 热重载 |
| frontend | 3000 | Next.js 热重载 |

#### 4.3 docker-compose.prod.yml

| 服务 | 端口 | 说明 |
|------|------|------|
| mysql | 内网 | MySQL 8 + 定时备份 |
| redis | 内网 | Redis 7 |
| backend | 内网 | NestJS 生产构建 |
| frontend | 内网 | Next.js standalone 模式 |
| nginx | 80/443 | 反向代理 + SSL |

#### 4.4 Dockerfile (后端)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/main.js"]
```

#### 4.5 Nginx 配置要点

- HTTP → HTTPS 301 重定向
- `/api` 反代到 backend:4000
- `/` 反代到 frontend:3000
- SSE 支持（`proxy_set_header Connection ''` + `proxy_read_timeout 86400s`）
- WebSocket 支持（EasyManager 端口）
- 静态资源缓存（images/CSS/JS → 1 年）
- 安全头（HSTS, X-Frame-Options, X-Content-Type-Options, CSP）

### 影响范围

- 新建 8 个配置文件
- 不影响现有代码

---

## 实施顺序

```
Phase 1 (最快见效)     Phase 2 (用户体验)      Phase 3 (生产就绪)
┌─────────────────┐   ┌─────────────────┐    ┌─────────────────┐
│ 帖子 @提及通知   │   │ 搜索历史+热门    │    │ BullMQ 队列     │
│ 半天            │   │ 1天             │    │ 1天             │
└─────────────────┘   └─────────────────┘    └─────────────────┘
                                                   ↓
                                          ┌─────────────────┐
                                          │ Docker 部署配置  │
                                          │ 2天             │
                                          └─────────────────┘
```

总计预估: 4.5 天

---

## 验证方案

| 功能 | 测试方法 |
|------|---------|
| 帖子 @提及 | 创建帖子包含 @其他用户 → 检查通知表 + 邮件日志 |
| 搜索历史 | 执行搜索 → 检查 search_history 表 → 查看 /search 页面历史记录 |
| 热门搜索 | 多次相同搜索 → Redis ZSET 更新 → `GET /search/popular` 返回 |
| BullMQ | 触发邮件 → `redis-cli` 查看 bull 队列 → 停止服务后重启 → 队列不丢失 |
| Docker | `docker compose -f docker-compose.dev.yml up -d` → 访问 localhost:3000 |
