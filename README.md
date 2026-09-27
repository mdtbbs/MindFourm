# MindFourm

Mindustry 社区论坛系统，集成 MindAuth OAuth SSO 认证和 MindFileList 资源文件托管。

当前状态：核心论坛、资源中心、社交、积分和管理后台已经可用；EasyManager 服务器管理默认暂停。下载事件持久化、资源 V1 正式启用、投票和群聊 UI 仍属于后续工作。

## 功能

- 帖子发布与回复（支持 Markdown、嵌套回复）
- 分类与标签系统
- 用户资料与头像
- 书签收藏
- 点赞系统
- 通知系统（回复、@提及、点赞、系统、举报）
- 私信功能
- 附件上传
- 资源中心（用户上传资源，审核流程）
- 搜索功能（MySQL LIKE，可升级至 Elasticsearch）
- 积分与等级系统
- 邮件通知（SMTP、队列处理）
- 管理面板（仪表盘、内容审核、用户管理、操作日志）
- 封禁管理（用户/IP/CIDR）
- 限流保护（Redis 原子操作）
- 好友、关注、用户屏蔽、群组
- 反应表情、积分、等级、徽章、积分商店和排行榜
- RSS 订阅、搜索历史、热门搜索
- LanLink 房间发现与游戏/论坛身份信息展示
- 外部服务 API（API Key、权限范围、模拟用户和审计日志）
- 插件生命周期、配置、权限和事件 Hook
- 隐私设置、法律条款确认、反馈和内容安全基础能力

### 当前未完成或暂未启用

- **投票**：尚未实现。
- **群聊 UI**：已有群组相关能力，但没有群聊页面和完整聊天体验。
- **下载统计持久化**：下载事件和去重记录目前在内存中，服务重启会丢失；数据库表、统计报表和后台展示待补齐。
- **资源 V1 公开接口**：代码已存在，但受 `feature_resources_v1_read_enabled` 控制，默认关闭；目前主要使用整数资源 ID，`public_id` 公开解析仍待完成。
- **插件主题/模板注入**：插件目前只能使用后端生命周期和事件 Hook，不能注入前端主题或页面模板。
- **插件热加载**：插件变更后需要重启服务。
- **IPv6 CIDR 封禁**：当前 IP 段匹配仅支持 IPv4。
- **EasyManager**：相关服务列表、申请和自动公告能力保留但默认关闭，见下文。

### 推荐后续顺序

1. 完成下载事件数据库化和后台统计。
2. 补齐登录、发帖、回复、资源上传/下载、审核和权限的真实 E2E 测试。
3. 做一次生产环境验收：数据库迁移、备份恢复、Redis、MindAuth、MFL、SSE、上传下载和健康检查。
4. 正式启用资源 V1 并完成 `public_id` 回填与解析。
5. 再考虑群聊 UI、投票、IPv6 封禁和插件前端扩展。

## 快速开始

### 环境要求

- Node.js 18+
- MySQL 8.0+
- Redis 7.0+

### 后端 (NestJS)

```bash
npm install
npm run dev        # 端口 4000
```

### 前端 (Next.js)

```bash
cd frontend
npm install
npm run dev        # 端口 3000
```

### 配置

复制 `.env.example` 到 `.env`：

```bash
cp .env.example .env
```

关键配置：
- `SITE_PROFILE` 与前端构建变量 `NEXT_PUBLIC_SITE_PROFILE` 必须一致。`mdtbbs` 保持中文站规则；`mindustry-club` 使用国际站语言、验证和功能策略。
- `MINDAUTH_URL` - MindAuth 服务地址
- `MINDAUTH_CLIENT_ID` / `MINDAUTH_CLIENT_SECRET` - OAuth 客户端信息
- `EASYMANAGER_ENABLED` - EasyManager 集成开关，当前默认 `false`
- `EASYMANAGER_URL` / `EASYMANAGER_API_KEY` - EasyManager 恢复时使用
- `MFL_BASE_URL` / `MFL_API_KEY` - MindFileList 文件托管集成
- `MYSQL_*` - MySQL 数据库配置
- `REDIS_*` - Redis 配置

### 独立社区站点

MindFourm 通过单一站点配置支持两个独立部署，不做运行时多租户。每个部署应使用各自的 MySQL 数据库、Redis 实例/逻辑库、上传目录和 OAuth Client：

| 站点 | Profile | URL | 语言 | 社区写入验证 |
|---|---|---|---|---|
| MDTBBS | `mdtbbs` | `https://mdtbbs.cn` | 简体中文 | 邮箱 + 手机 |
| Mindustry Club | `mindustry-club` | `https://mindustry.club` | English / Русский / 日本語 | 邮箱，不要求手机号 |

Club 示例配置、MindAuth Client 设置和数据隔离要求见 [`docs/international-site-profiles.md`](docs/international-site-profiles.md)。两个站点的本地用户、内容、审核和文件互不共享；MindAuth 负责统一身份。

### 数据库

MySQL 数据库 `mindfourm`，首次启动自动建表。生产环境应使用显式迁移并在迁移前完成备份。

主要表：`users`, `posts`, `replies`, `categories`, `tags`, `notifications`, `messages`, `attachments`, `resources`, `settings`, `bans`

## 服务集成

### MindAuth OAuth SSO

MindFourm 通过 MindAuth 完成登录授权，并在本地创建 Redis session。

### MindFileList 资源文件托管

资源中心可将上传文件转存到 MindFileList，由 MFL 管理文件存储、审核状态与下载限制。

### EasyManager — ⏸ 暂停中

EasyManager 服务器列表、服务器申请和自动公告回调代码保留，但当前默认关闭：

- 后端：`EASYMANAGER_ENABLED=false` 时不连接 EasyManager，服务器 API 返回空数据或禁用提示
- 前端：`feature_servers_enabled=false` 时隐藏服务器入口和首页服务器区块

保留的恢复接口：

| 论坛端点 | 当前禁用行为 |
|------|------|
| `GET /api/servers/public` | 返回空服务器列表 |
| `GET /api/servers/versions` | 返回空版本列表 |
| `GET /api/servers/templates` | 返回空模板列表 |
| `GET /api/servers/my` | 需登录后返回空服务器列表 |
| `POST /api/servers/apply` | 返回服务器功能已关闭 |

恢复 EasyManager 时，需要设置 `EASYMANAGER_ENABLED=true` 并在后台功能管理中开启 `feature_servers_enabled`。

## 管理面板

访问 `/admin` 进入管理面板，需要管理员权限。

### 功能模块

| 分组 | 功能 |
|------|------|
| **总览** | 仪表盘（统计卡片、7日活跃图） |
| **站点** | 基本信息、公告管理、显示设置、SEO 设置 |
| **内容** | 帖子管理、标签管理、审核队列 |
| **系统** | 发帖规则、限流设置、封禁管理、数据清理 |
| **管理** | 分类管理、用户管理、系统日志 |
| **资源** | 资源管理、资源审批、类别管理 |

### 侧边栏分组

管理后台侧边栏支持按功能分组显示，角色自动过滤（admin/moderator）。

## API 文档

API 现在按用途分层：

- **First-party V1**：`/api/v1/*`，供 Web、Android、桌面端和 Mindustry Mod 使用。
- **External API**：`/api/external/v1/*`，供机器人和服务端集成使用。
- **Legacy / internal**：其他 `/api/*`，主要用于论坛现有前端、后台和历史兼容，不承诺第三方稳定性。

文档入口：

- [`docs/api/README.md`](docs/api/README.md) - API 总览、响应格式、兼容策略
- [`docs/api/first-party-v1.md`](docs/api/first-party-v1.md) - V1 endpoint 参考
- [`docs/api/authentication.md`](docs/api/authentication.md) - Browser / Mobile / MindAuth / External API 认证
- [`docs/api/game-content-v1.md`](docs/api/game-content-v1.md) - 蓝图和地图 API
- [`docs/api/external.md`](docs/api/external.md) - 机器人 / 服务端 External API

运行时文档：

```text
/api/docs/v1
/api/openapi/v1.json
```

第一方客户端应从能力发现开始：

```http
GET /api/v1/capabilities
```

## E2E 测试

```bash
npx playwright test
npx playwright test --ui
```

当前单元测试覆盖较广，但 E2E 仍应以真实 MindAuth、数据库、Redis 和文件服务联调结果为准；不能把未运行或被环境阻塞的 E2E 视为通过。

## 生产部署检查

- 确认 `NODE_ENV=production`、`FRONTEND_URL`、MindAuth、MySQL、Redis 和 MFL 配置正确。
- 先执行数据库备份，再执行迁移和构建。
- 检查服务用户、文件权限、磁盘空间、systemd/Docker 健康状态。
- 验证 `/health`、登录、SSE、资源上传、资源下载和后台审核链路。
- 通过反向代理部署时确认 HTTPS、CORS、Cookie、`X-Forwarded-For` 和 SSE 长连接配置。

## 技术栈

### 后端
- NestJS
- TypeORM
- MySQL 8
- Redis 7
- Markdown 解析
- Cursor 分页
- Bull 队列（邮件）

### 前端
- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Zustand (状态管理)
- TanStack React Query
- SSE (实时通知)

## 许可证

MIT
