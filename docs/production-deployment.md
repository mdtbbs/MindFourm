# MindFourm 生产部署清单

本文面向生产环境部署当前 MindFourm 版本。生产环境由 NestJS 后端、Next.js 前端、MySQL 8 和 Redis 7 组成；MindAuth 和 MindFileList 为外部依赖。

当前发布注意事项：EasyManager 默认关闭；下载生命周期事件由数据库持久化，管理统计从数据库聚合。Resource V1 公开读取和稳定 `public_id` 已在代码及 Public V1 OpenAPI 中实现，实际可用性仍受运行时 feature setting 和部署状态控制。投票和完整群聊 UI 尚未实现。

## 1. 发布前检查

在仓库根目录执行：

```bash
npm ci
cd frontend && npm ci
cd ..
npm test
npm run build
```

`npm run build` 已经包含后端和前端构建，不需要重复执行前端构建。

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

`SITE_PROFILE` 必须是 `mdtbbs` 或 `mindustry-club`；前端构建时的 `NEXT_PUBLIC_SITE_PROFILE` 必须使用相同值。Profile 在一个部署生命周期内固定。Mindustry Club 和 MDTBBS 必须使用不同的数据库、Redis、`RESOURCE_UPLOAD_ROOT` 与 MindAuth OAuth Client。Club 专用示例、迁移影响和 MindAuth 配置见 [`international-site-profiles.md`](international-site-profiles.md)。

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

`download_events` 保存 requested、granted、started、completed、failed 生命周期事件；新 grant 通过数据库去重表按短窗口去重。管理仪表盘按数据库事件聚合 downloads 与 failed counts。它是业务统计数据，不包含完整客户端 IP 审计记录。

生产环境不要使用 `.env.example` 中的 `change-me` 值。

### 阿里云 ESA 回源与客户端上下文

将源站仅暴露给 ESA/受信反代，并在 ESA 开启回源 IP 透传。后端按以下顺序读取已由边缘覆写的地址：`ali-real-client-ip`、`x-real-ip`、`cf-connecting-ip`、`X-Forwarded-For` 首项、TCP 对端地址。因此 ESA 存在时会优先记录其提供的真实客户端 IP，而非 CDN 地址。位置缺少省市信息时，`ali-ip-country` 的 ISO 3166-1 Alpha-2 值（例如 `cn`）会作为位置标签回退。

不要让客户端绕过 ESA 直连应用端口；否则任何可直连的客户端都可能伪造这些请求标头，影响按 IP 的限流、封禁和审计。

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

应用 DataSource 目前配置 `migrationsRun: true`，应用初始化也会执行尚未记录的 TypeORM migrations。生产发布仍应在启动应用前显式查看并执行迁移、记录结果，再启动服务并验证 schema；不要依赖 `synchronize`。

当前功能涉及的重点表包括：

- `resource_comments`
- `friendships`
- `users` presence 相关字段（如当前迁移版本需要）
- `resources`、`resource_versions`、`resource_ratings`

Resource V1 使用资源/版本/文件 `public_id` UUID 作为稳定公开标识。`feature_resources_v1_read_enabled` 的代码默认值为开启，但后台运行时配置可以关闭它；发布前应检查目标环境设置和公开路由。Resource Center V2 migrations、历史数据回填与文件审核/发布状态需要单独完成生产验收；本清单不把本地构建或 migration 文件存在视为生产验收。

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
- 云存档二进制上传 `/api/v1/game-saves/uploads/{uploadId}/file` 应由公网入口直接流式转发到后端；若入口流量经过 Next.js，则由专用 Route Handler 流式转发，不能落入通用 `/api/:path*` rewrite。
- 云存档上传 location 将请求体直接流向 NestJS，并将 `client_max_body_size` 设为后端单文件限制（默认 50 MiB）。
- 前端页面和静态资源转发到 Next.js。
- 头像、公共图片与已上传文件由后端 NestJS 提供（`@nestjs/serve-static`，见 `src/app.module.ts`）。`/uploads/` 必须直接代理到后端，并且要放在通用 `location /` 之前；若落到 Next.js，只会命中 `/uploads/:path*` 这条 `fallback` rewrite，Next.js 没有对应路由，最终返回后端的 500 错误信封 `{"success":false,"message":"服务器内部错误"}`。
- SSE `/api/notifications/events` 保持长连接，不缓冲。
- `X-Forwarded-For`、`X-Forwarded-Proto` 正确传递。
- HTTPS 终止在 Nginx，并将 HTTP 重定向到 HTTPS。

`nginx/conf.d/default.conf` 已包含云存档上传专用 location。实际部署若使用宝塔 vhost 或其他反向代理，可在接收 ESA/公网流量的那一层添加等价规则；该规则必须透传 `Authorization` 和 `X-Request-ID`，并设置 `proxy_request_buffering off`。当前应用也包含 `frontend/src/app/api/v1/game-saves/uploads/[uploadId]/file/route.ts`，在公网入口仍经过 Next.js 时直接以流方式转发请求体，不读取整段文件到内存。`frontend/next.config.js` 将通用 `/api/:path*` rewrite 配置为 `fallback`，在动态路由之后执行，确保专用 Route Handler 先接管该 PUT。

头像与公共图片对应的代理规则：

```nginx
location ^~ /uploads/ {
    proxy_pass http://mindforum_backend;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    expires 7d;
    add_header Cache-Control "public, max-age=604800";
}
```

`add_header` 会替换继承自 server 层的同名安全头，所以该 location 若要加 `Cache-Control`，必须一并重复 `X-Content-Type-Options` 等头部。

生产环境的 `uploads/` 必须是持久化卷（容器部署见 `docker-compose.prod.yml` 的 `uploads_data:/app/uploads`），否则容器重建后数据库里的头像 URL 仍在，文件已经不存在。

```nginx
location ^~ /api/v1/game-saves/uploads/ {
    client_max_body_size 50m;
    client_body_timeout 300s;
    proxy_pass http://mindforum_backend;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Request-ID $http_x_request_id;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    proxy_set_header Connection '';
}
```

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
- 头像与公共图片直接可访问，且**不返回 500**：

```bash
curl -o /dev/null -s -w '%{http_code}\n' https://forum.example.com/uploads/avatars/<任意文件>
```

  该请求应返回 `200`；文件不存在应返回 `404` 或 `301`，出现 `500` 或 `{"success":false,"message":"服务器内部错误"}` 说明 `/uploads/` 没有被后端接管（见「反向代理要求」）。
- 使用真实测试账号上传一个大于 10 MiB 的云存档并完成提交；同一 `X-Request-ID` 应出现在后端请求日志中，Next.js 日志不应再出现该 PUT 的 10 MiB 请求体警告。
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

## ResourceStorage 配置

新资源持久上传要求 `RES_ENABLED=true`、`RES_BASE_URL=https://res.mdtbbs.cn` 与服务端 `RES_API_KEY`，超时默认请求 10000ms、上传 120000ms，可用 `RES_REQUEST_TIMEOUT_MS` / `RES_UPLOAD_TIMEOUT_MS` 调整。API key 只在后端环境配置。禁用或缺失配置时历史 managed/MFL/external 读取保持兼容，新上传明确返回服务不可用。

上线前单独验收新增迁移、RES API 可达性及 binding 权限；历史迁移为显式 CLI，默认保留旧文件。详见 [ResourceStorage](resource-storage.md)。本接入 PR 不执行生产迁移或部署。
