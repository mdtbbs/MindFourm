# MindFourm

Mindustry 社区论坛系统，集成 MindAuth OAuth SSO 认证。

## 功能

- 帖子发布与回复（支持嵌套回复）
- 分类与标签系统
- 用户资料与头像
- 书签收藏
- 通知系统（回复、@提及、私信）
- 私信功能
- 附件上传
- 资源中心（用户上传资源，审核流程）
- 管理面板（内容审核、用户管理、操作日志）

## 快速开始

### 后端 (Koa)

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

### 数据库

SQLite 数据库位于 `data/forum.db`，首次启动自动创建。

## 技术栈

### 后端
- Koa.js
- SQLite (better-sqlite3)
- Markdown 解析
- Cursor 分页

### 前端
- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- React Context (认证状态)

## 管理面板

访问 `/admin` 进入管理面板，需要管理员权限。

功能：
- 用户管理（角色调整）
- 帖子管理（置顶、移动、批量操作）
- 内容审核（待审帖子审批）
- 分类/标签管理
- 系统设置
- 封禁管理
- 操作日志

## E2E 测试

```bash
npx playwright test
npx playwright test --ui
```

## 许可证

MIT