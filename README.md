# MindFourm

Mindustry 社区论坛系统，集成 MindAuth OAuth SSO 认证和 MindFileList 资源文件托管。EasyManager 服务器管理代码保留但当前暂停，服务器功能默认关闭。

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
- `MINDAUTH_URL` - MindAuth 服务地址
- `MINDAUTH_CLIENT_ID` / `MINDAUTH_CLIENT_SECRET` - OAuth 客户端信息
- `EASYMANAGER_ENABLED` - EasyManager 集成开关，当前默认 `false`
- `EASYMANAGER_URL` / `EASYMANAGER_API_KEY` - EasyManager 恢复时使用
- `MFL_BASE_URL` / `MFL_API_KEY` - MindFileList 文件托管集成
- `MYSQL_*` - MySQL 数据库配置
- `REDIS_*` - Redis 配置

### 数据库

MySQL 数据库 `mindfourm`，首次启动自动建表。

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

## API 示例

### 服务 API（外部软件调用）

使用 `FORUM_API_KEY` 以指定账号执行操作：

```http
POST /api/service-api/posts
Content-Type: application/json
x-api-key: <FORUM_API_KEY>

{
  "user_id": 3,
  "title": "标题",
  "content": "正文",
  "category_id": 1,
  "tags": ["公告"]
}
```

账号标识支持：`user_id`、`mindauth_id`、`username`（三选一）。

## E2E 测试

```bash
npx playwright test
npx playwright test --ui
```

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
