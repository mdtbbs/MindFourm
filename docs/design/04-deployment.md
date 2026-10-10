# 部署方案

> 本文档记录论坛系统的部署方案。**当前部署不使用 Docker**：生产与本地开发都直接运行
> Node.js 进程，生产由 PM2 托管、Nginx 反向代理。可执行步骤见
> [`../bare-metal-deployment.md`](../bare-metal-deployment.md)。
> 创建时间: 2026-06-07（2026-10 移除 Docker 方案）

## 技术选型

| 项目 | 选择 |
|------|------|
| 运行时 | Node.js 20（后端 NestJS、前端 Next.js） |
| 进程管理 | PM2（`ecosystem.config.js`） |
| 数据库 | MySQL 8 |
| 缓存 | Redis 7 |
| 反向代理 | Nginx |
| SSL | Let's Encrypt |

---

## 本地开发环境

不使用 Docker Compose。直接在宿主机启动 MySQL 8、Redis 7，再启动应用：

```bash
# 后端（热重载）
npm ci
npm run dev

# 前端（热重载）
cd frontend && npm ci && npm run dev
```

本地默认端口：后端 4000，前端 4502（`frontend/package.json` 的 `dev` 脚本）。
环境变量见 `.env.example`。

---

## 生产环境（云服务器）

### 服务组成

- MySQL 8（本机或独立实例）
- Redis 7
- 后端 NestJS（PM2 托管，监听 127.0.0.1:4000）
- 前端 Next.js（PM2 托管 standalone server，监听 127.0.0.1:3000）
- Nginx（反向代理 + SSL，终止 80/443）

### 网络架构

```
                    ┌──────────┐
                    │  Nginx   │ :443 (HTTPS)
                    │  :80     │ :80 (HTTP → HTTPS redirect)
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼                     ▼
        ┌──────────┐         ┌──────────┐
        │ Frontend │         │ Backend  │
        │   :3000  │         │   :4000  │
        └──────────┘         └────┬─────┘
                                  │
                         ┌────────┼────────┐
                         ▼        ▼        ▼
                    ┌────────┐┌────────┐┌────────┐
                    │ MySQL  ││ Redis  ││ MindAuth│
                    └────────┘└────────┘└────────┘
```

### 启动（PM2）

```bash
npm ci && npm run build
cd frontend && npm ci && npm run build && cd ..
pm2 start ecosystem.config.js --env production
pm2 save
```

`ecosystem.config.js` 分别为 `mindforum-api` 与 `mindforum-frontend` 声明单实例 fork
模式，并各自读取 `.env` / `frontend/.env.production`。为什么不是 cluster 模式见该
文件顶部注释（SSE 连接表、进程内缓存与启动 bootstrap 都是按单进程设计的）。

### 更新部署

```bash
git pull
npm ci && npm run build
cd frontend && npm ci && npm run build && cd ..
npm run migration:show && npm run migration:run
pm2 reload ecosystem.config.js --env production
```

### 回滚

1. 保留当前日志与错误响应。
2. `git checkout` 回上一个发布 tag，重新 build。
3. 若该版本含不兼容迁移，按迁移的 `down` 回滚并确认数据；不可逆迁移用备份恢复。

---

## 监控与维护

| 项目 | 方案 |
|------|------|
| 日志 | PM2 日志（`logs/*.log`）+ 日志轮转 |
| 健康检查 | 后端 `/api/health` |
| 备份 | MySQL 定时备份（cron + mysqldump） |
| 监控 | 可选 Prometheus + Grafana |
| 上传目录 | 必须持久化（`uploads/`），不要指向临时目录 |
