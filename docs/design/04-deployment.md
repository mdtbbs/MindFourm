# 部署方案

> 本文档记录了论坛系统的部署方案，支持本地 Docker 和云服务器 Docker。
> 创建时间: 2026-06-07

## 技术选型

| 项目 | 选择 |
|------|------|
| 容器化 | Docker + Docker Compose |
| 本地开发 | Docker Compose (dev) |
| 生产部署 | Docker Compose (prod) + Nginx |
| 反向代理 | Nginx |
| SSL | Let's Encrypt |

---

## 本地开发环境

### docker-compose.dev.yml

服务组成：
- `mysql:8` - 数据库（端口 3306）
- `redis:7-alpine` - 缓存（端口 6379）
- `backend` - NestJS 后端（端口 3001，热重载）
- `frontend` - Next.js 前端（端口 3000，热重载）

### 启动命令
```bash
docker compose -f docker-compose.dev.yml up -d
```

### 环境变量（.env.dev）
```
MINDAUTH_URL=http://localhost:4001
MINDAUTH_CLIENT_ID=forum
MINDAUTH_CLIENT_SECRET=<secret>
FRONTEND_URL=http://localhost:3000
```

---

## 生产环境（云服务器）

### docker-compose.prod.yml

服务组成：
- `mysql:8` - 数据库（不暴露端口）
- `redis:7-alpine` - 缓存（不暴露端口）
- `backend` - NestJS 后端（生产构建）
- `frontend` - Next.js 前端（生产构建）
- `nginx` - 反向代理 + SSL（端口 80/443）

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
        │   :3000  │         │   :3001  │
        └──────────┘         └────┬─────┘
                                  │
                         ┌────────┼────────┐
                         ▼        ▼        ▼
                    ┌────────┐┌────────┐┌────────┐
                    │ MySQL  ││ Redis  ││ MindAuth│
                    └────────┘└────────┘└────────┘
```

### 环境变量（.env.prod）
```
MYSQL_ROOT_PASSWORD=<strong-password>
DATABASE_URL=mysql://root:<password>@mysql:3306/forum
REDIS_URL=redis://redis:6379
JWT_SECRET=<jwt-secret>
MINDAUTH_URL=<production-mindauth-url>
MINDAUTH_CLIENT_ID=forum
MINDAUTH_CLIENT_SECRET=<secret>
FRONTEND_URL=<your-domain>
DOCKER_REGISTRY=<your-registry>
VERSION=1.0.0
```

### Nginx 配置要点
- HTTP → HTTPS 重定向
- 静态资源缓存（图片、CSS、JS）
- WebSocket/SSE 连接支持（`proxy_set_header Connection ''`）
- gzip 压缩
- 安全头（HSTS, X-Frame-Options, etc.）

---

## Dockerfile

### 后端 Dockerfile
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
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

### 前端 Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 部署流程

### 首次部署
1. 云服务器安装 Docker + Docker Compose
2. 克隆代码到服务器
3. 配置 `.env.prod` 环境变量
4. 执行 `docker compose -f docker-compose.prod.yml up -d --build`
5. 配置域名和 SSL 证书
6. 运行数据库迁移

### 更新部署
1. 拉取最新代码
2. 执行 `docker compose -f docker-compose.prod.yml up -d --build`
3. 运行数据库迁移（如有）

### 回滚
1. 使用 Docker 镜像标签回滚到上一版本
2. 执行 `docker compose -f docker-compose.prod.yml up -d`

---

## 监控与维护

| 项目 | 方案 |
|------|------|
| 日志 | Docker logs + 日志轮转 |
| 健康检查 | Docker healthcheck（后端 /health 端点） |
| 备份 | MySQL 定时备份（cron + mysqldump） |
| 监控 | 可选 Prometheus + Grafana |
