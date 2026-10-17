# MindFourm 开发备忘单

## 🎯 快速启动命令

```bash
# 开发环境
npm run dev                    # 后端开发服务器 (端口 5100)
cd frontend && npm run dev     # 前端开发服务器 (端口 4502)

# 构建
npm run build                  # 构建前后端
npm run build:backend          # 仅构建后端
npm run build:frontend         # 仅构建前端

# 测试
npm test                       # Jest 单元测试
npm run test:e2e              # Playwright E2E 测试
npm run test:watch            # Jest 监听模式

# 代码质量
npm run lint                  # ESLint 检查
npm run typecheck:frontend    # TypeScript 类型检查

# 数据库迁移
npm run migration:show        # 查看迁移状态
npm run migration:run         # 运行迁移
npm run migration:revert      # 回滚迁移

# OpenAPI
npm run openapi:export        # 导出 OpenAPI 文档
npm run openapi:check         # 检查 API 变更
```

## 📁 关键文件位置

```
配置文件:
├── .env                      # 环境变量 (本地)
├── .env.example              # 环境变量示例
├── tsconfig.json             # TypeScript 配置 (后端)
├── frontend/tsconfig.json    # TypeScript 配置 (前端)
├── jest.config.js            # Jest 测试配置
├── playwright.config.ts      # Playwright E2E 配置
├── .prettierrc.json          # Prettier 格式化配置
├── .eslintrc.json            # ESLint 配置 (前端)
└── .editorconfig             # 编辑器通用配置

VSCode 配置:
└── .vscode/
    ├── settings.json         # 工作区设置
    ├── launch.json           # 调试配置
    ├── tasks.json            # 任务配置
    ├── extensions.json       # 推荐扩展
    ├── typescript.code-snippets  # 代码片段
    └── README.md             # 配置指南

入口文件:
├── src/main.ts               # NestJS 入口
├── src/app.module.ts         # NestJS 根模块
└── frontend/src/app/         # Next.js 应用
```

## 🔌 端口使用

| 服务 | 端口 | 说明 |
|------|------|------|
| 后端 API | 5100 | NestJS 服务器 |
| 前端应用 | 4502 | Next.js 开发服务器 |
| 数据库 | 3306 | MySQL |
| Redis | 6379 | Redis 缓存 |
| Mailhog | 8025 | 邮件测试 UI |

## 🌍 环境变量

必需的环境变量 (`.env` 文件):

```bash
# 数据库
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USERNAME=root
DATABASE_PASSWORD=password
DATABASE_NAME=mindforum

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# 应用
NODE_ENV=development
PORT=5100
SITE_PROFILE=mdtbbs

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# OAuth (可选)
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
```

## 📚 常用 VSCode 命令

按 `Ctrl+Shift+P` / `Cmd+Shift+P` 打开命令面板：

| 命令 | 说明 |
|------|------|
| `Tasks: Run Task` | 运行任务 |
| `Debug: Select and Start Debugging` | 启动调试 |
| `TypeScript: Restart TS Server` | 重启 TS 服务器 |
| `ESLint: Restart ESLint Server` | 重启 ESLint 服务器 |
| `Preferences: Color Theme` | 更换主题 |
| `Git: Clone` | 克隆仓库 |
| `File: Save All` | 保存所有文件 |

## 🐛 调试快捷键

| 快捷键 | 功能 |
|--------|------|
| `F5` | 启动调试 |
| `Ctrl+F5` | 运行不调试 |
| `F9` | 切换断点 |
| `F10` | 单步跳过 |
| `F11` | 单步进入 |
| `Shift+F11` | 单步退出 |
| `Ctrl+Shift+F5` | 重启调试 |

## 📝 代码片段

在 TypeScript 文件中输入以下前缀：

| 前缀 | 生成内容 |
|------|----------|
| `nest-controller` | NestJS 控制器 |
| `nest-service` | NestJS 服务 |
| `nest-module` | NestJS 模块 |
| `nest-dto` | NestJS DTO |
| `typeorm-entity` | TypeORM 实体 |
| `jest-describe` | Jest describe 块 |
| `jest-test` | Jest 测试用例 |
| `next-page` | Next.js 页面 |
| `react-component` | React 组件 |

## 🔍 故障排除

### TypeScript 错误
```bash
# 重启 TS Server
# VSCode: TypeScript: Restart TS Server

# 清理并重新构建
rm -rf dist node_modules
npm ci
npm run build:backend
```

### 测试失败
```bash
# 运行单个测试
npm test -- --testPathPattern=filename

# 更新快照
npm test -- -u

# 详细输出
npm test -- --verbose
```

### 数据库连接失败
```bash
# 检查数据库是否运行
# MySQL
mysql -u root -p

# Redis
redis-cli ping
```

### 前端构建失败
```bash
# 清理缓存
cd frontend
rm -rf .next node_modules
npm ci
npm run build
```

## 📊 性能优化建议

1. **VSCode 设置**
   - 禁用不需要的扩展
   - 排除 `node_modules` 和 `dist` 搜索
   - 启用 TypeScript 增量编译

2. **开发流程**
   - 使用 `npm ci` 而非 `npm install`
   - 使用 Turbopack (Next.js 15 默认)
   - 启用 Jest 并行测试

3. **调试技巧**
   - 使用条件断点
   - 使用日志点 (Logpoint)
   - 使用调试控制台

## 📖 学习资源

- [项目文档](../docs/README.md)
- [API 文档](http://localhost:5100/api/v1)
- [NestJS 文档](https://docs.nestjs.com/)
- [Next.js 文档](https://nextjs.org/docs)
- [TypeORM 文档](https://typeorm.io/)

## 🆘 获取帮助

1. 查看项目文档: `docs/`
2. 查看 API 文档: http://localhost:5100/api/v1
3. 查看 VSCode 配置指南: `.vscode/README.md`
4. 查看环境变量示例: `.env.example`

---

最后更新: 2026-10-17