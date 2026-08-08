# MindFourm 生产部署清单

本文面向生产环境部署当前 MindFourm 版本。生产环境由 NestJS 后端、Next.js 前端、MySQL 8 和 Redis 7 组成；MindAuth 和 MindFileList 为外部依赖。

## 1. 发布前检查

在仓库根目录执行：

```bash
npm ci
cd frontend && npm ci
cd ..
npm test
npm run build
cd frontend && npm run build
```

必须确认：

- 后端测试全部通过。
- 后端 `dist/` 构建成功。
- 前端 `next build` 成功。
- 生产域名已经确定，并与 MindAuth OAuth 回调白名单一致。
- MySQL 数据库已备份。
- Redis 数据已持久化或确认可接受重新建立缓存。

## 2. 环境变量

复制并填写：

```bash
cp .env.example .env
cp frontend/.env.local.example frontend/.env.production
```

生产环境至少需要配置：

### 后端

| 变量 | 说明 |
|---|---|
| `NODE_ENV` | 必须为 `production` |
| `PORT` | NestJS 监听端口 |
| `FRONTEND_URL` | 浏览器访问的完整 HTTPS 地址 |
| `API_URL` | 后端自身的完整外部地址；未设置时由 `PORT` 推导 |
| `MYSQL_HOST` / `MYSQL_PORT` | MySQL 地址和端口 |
| `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | MySQL 凭据和数据库名 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Redis 连接 |
| `MINDAUTH_URL` | MindAuth 地址 |
| `MINDAUTH_CLIENT_ID` / `MINDAUTH_CLIENT_SECRET` | OAuth 客户端凭据 |
| `MINDAUTH_CALLBACK_URL` | 必须是 `${API_URL}/api/auth/callback` |
| `SETTINGS_REVALIDATE_SECRET` | 随机长密钥，前后端内部缓存刷新共用 |
| `MFL_BASE_URL` / `MFL_API_KEY` | MindFileList 集成；不使用时保持空并关闭对应功能 |
| `FORUM_API_KEY` | 旧自动化 API fallback；建议使用后台 External API key |
| `LANLINK_ENABLED` / `LANLINK_URL` | LanLink 集成开关和控制面地址 |
| `EASYMANAGER_ENABLED` | 当前默认 `false`，除非已恢复 EasyManager |

生产环境不要使用 `.env.example` 中的 `change-me` 值。

### 前端

前端生产变量使用 `frontend/.env.production`，至少确认：

- `NEXT_PUBLIC_SITE_URL`：浏览器访问的完整 HTTPS 地址。
- `NEXT_PUBLIC_API_URL`：后端 API 地址（如果部署不是同源代理）。
- `NEXT_PUBLIC_MINDAUTH_URL`：MindAuth 地址。
- `NEXT_PUBLIC_MINDAUTH_CLIENT_ID`：与后端一致的 OAuth client id。
- `NEXT_PUBLIC_SETTINGS_REVALIDATE_SECRET`：仅在确实需要前端内部 revalidate 时设置；不要暴露后端服务密钥。

## 3. 数据库迁移

生产部署前先查看待执行迁移：

```bash
npm run migration:show
```

确认备份完成后执行：

```bash
npm run migration:run
```

当前功能涉及的重点表包括：

- `resource_comments`
- `friendships`
- `users` presence 相关字段（如当前迁移版本需要）
- `resources`、`resource_versions`、`resource_ratings`

不要在生产环境使用 TypeORM `synchronize` 替代迁移。

## 4. Redis 配置

Presence 好友推送依赖 Redis keyspace notifications。推荐在 Redis 配置中持久化：

```conf
notify-keyspace-events KEA
```

如果只能在线修改：

```bash
redis-cli CONFIG SET notify-keyspace-events KEA
```

验证：

```bash
redis-cli CONFIG GET notify-keyspace-events
```

Presence 仍可查询，但未开启该配置时好友在线状态变化不会通过 SSE 推送。

## 5. 启动顺序

推荐顺序：

1. MySQL
2. Redis
3. 后端 NestJS
4. 前端 Next.js
5. Nginx / 反向代理

后端：

```bash
npm ci
npm run build:backend
NODE_ENV=production node dist/main.js
```

前端：

```bash
cd frontend
npm ci
npm run build
npm start
```

如果使用 systemd、PM2 或容器，确保应用进程的工作目录、环境文件和 `dist/` / `.next/` 路径正确。

## 6. 反向代理要求

Nginx 至少需要：

- `/api/` 转发到后端。
- 前端页面和静态资源转发到 Next.js。
- SSE `/api/notifications/events` 保持长连接，不缓冲。
- `X-Forwarded-For`、`X-Forwarded-Proto` 正确传递。
- HTTPS 终止在 Nginx，并将 HTTP 重定向到 HTTPS。

SSE location 应关闭代理缓冲并允许较长读取超时，例如：

```nginx
location /api/notifications/events {
    proxy_pass http://mindforum_backend;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
}
```

## 7. 发布后冒烟检查

```bash
curl -fsS https://forum.example.com/api/health
curl -fsS https://forum.example.com/api/version
```

浏览器检查：

- 首页和帖子列表可加载。
- 登录、OAuth callback、条款接受流程可完成。
- 桌面端出现左侧主导航，顶部只显示工具栏。
- 手机/平板可以打开 Drawer，不存在 `md ~ lg` 导航断档。
- `/resources`、资源详情、资源评论正常。
- `/friends`、`/notifications`、`/messages` 可访问。
- 关闭资源/服务器等 feature flag 后对应导航不出现。
- 未登录用户看不到通知、消息、好友、书签、设置等私有导航。
- admin 页面仍使用独立后台侧栏。

## 8. 回滚

如果发布后出现严重问题：

1. 保留当前日志和错误响应。
2. 回滚前端到上一份 `.next` 构建或上一镜像。
3. 后端回滚到上一份 `dist` / 镜像。
4. 数据库迁移必须先确认是否可逆；不可逆迁移不要盲目回退应用版本。
5. 修复后重新执行测试、构建和冒烟检查。

不要删除 Redis 或 MySQL 数据作为常规回滚手段。
