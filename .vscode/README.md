# VSCode 开发环境配置指南

本指南帮助你快速配置 MindFourm 项目的 VSCode 开发环境。

## 📦 自动安装推荐扩展

首次打开项目时，VSCode 会提示安装推荐扩展。点击"安装所有推荐扩展"即可。

或者手动安装：

1. 按 `Ctrl+Shift+X` (Windows/Linux) 或 `Cmd+Shift+X` (macOS) 打开扩展面板
2. 输入 `@recommended` 查看推荐扩展列表
3. 点击"安装工作区推荐扩展"

### 核心扩展列表

| 扩展名 | 用途 |
|--------|------|
| **ESLint** | 代码质量检查 |
| **Prettier** | 代码格式化 |
| **Tailwind CSS IntelliSense** | Tailwind CSS 智能提示 |
| **vscode-icons** | 文件图标主题 |
| **GitLens** | Git 增强工具 |
| **REST Client** | API 测试工具 |
| **DotENV** | 环境变量文件支持 |
| **Playwright Test** | E2E 测试工具 |

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装后端依赖
npm ci

# 安装前端依赖
cd frontend && npm ci
```

或者使用 VSCode 任务：

- 按 `Ctrl+Shift+P` / `Cmd+Shift+P`
- 输入 `Tasks: Run Task`
- 选择 `install:all`

### 2. 配置环境变量

```bash
# 复制环境变量示例文件
cp .env.example .env
```

编辑 `.env` 文件，配置数据库连接等参数。

### 3. 启动开发服务器

#### 方法一：使用调试面板

按 `F5` 或点击"运行和调试"面板，选择：

- `Backend: Dev Server` - 仅启动后端开发服务器
- `Frontend: Dev Server` - 仅启动前端开发服务器
- `Full Stack: Dev` - 同时启动前后端

#### 方法二：使用终端

```bash
# 后端开发服务器 (http://localhost:5100)
npm run dev

# 前端开发服务器 (http://localhost:4502)
cd frontend && npm run dev
```

## 🔧 常用 VSCode 任务

按 `Ctrl+Shift+P` / `Cmd+Shift+P`，输入 `Tasks: Run Task`：

### 构建任务

| 任务名 | 说明 |
|--------|------|
| `build` | 构建前后端（默认） |
| `build:backend` | 仅构建后端 |
| `build:frontend` | 仅构建前端 |

### 测试任务

| 任务名 | 说明 |
|--------|------|
| `test:unit` | 运行 Jest 单元测试（默认） |
| `test:e2e` | 运行 Playwright E2E 测试 |
| `test:watch` | Jest 监听模式 |

### 代码质量

| 任务名 | 说明 |
|--------|------|
| `lint` | ESLint 检查前端代码 |
| `typecheck:frontend` | 前端 TypeScript 类型检查 |
| `typecheck:backend` | 后端 TypeScript 类型检查 |

### 数据库迁移

| 任务名 | 说明 |
|--------|------|
| `migration:show` | 显示迁移状态 |
| `migration:run` | 运行迁移 |
| `migration:revert` | 回滚迁移 |

## 🐛 调试配置

### 后端调试

1. 在代码中设置断点（点击行号左侧）
2. 按 `F5` 启动调试
3. 选择 `Backend: Dev Server` 或 `Backend: Debug Server`

### 前端调试

1. 启动前端开发服务器
2. 选择 `Frontend: Chrome Dev`
3. 会自动打开 Chrome 并附加调试器

### Jest 测试调试

1. 打开测试文件
2. 选择 `Jest: Current File`
3. 在测试代码中设置断点

### Playwright 调试

1. 打开 E2E 测试文件
2. 选择 `Playwright: Debug Current File`
3. 会打开 Playwright Inspector

## 📝 代码片段

在 TypeScript 文件中输入以下前缀快速生成代码：

| 前缀 | 说明 |
|------|------|
| `nest-controller` | NestJS 控制器 |
| `nest-service` | NestJS 服务 |
| `nest-module` | NestJS 模块 |
| `nest-dto` | NestJS DTO |
| `typeorm-entity` | TypeORM 实体 |
| `jest-describe` | Jest describe 块 |
| `jest-test` | Jest 测试用例 |
| `next-page` | Next.js 页面 |
| `react-component` | React 组件 |

## ⌨️ 常用快捷键

### 编辑器

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` / `Cmd+S` | 保存（自动格式化） |
| `Ctrl+Shift+F` / `Cmd+Shift+F` | 全局搜索 |
| `Ctrl+P` / `Cmd+P` | 快速打开文件 |
| `Ctrl+Shift+P` / `Cmd+Shift+P` | 命令面板 |

### 调试

| 快捷键 | 功能 |
|--------|------|
| `F5` | 启动调试 |
| `F9` | 切换断点 |
| `F10` | 单步跳过 |
| `F11` | 单步进入 |
| `Shift+F11` | 单步退出 |

### 终端

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+` ` | 切换终端 |
| `Ctrl+Shift+` ` | 新建终端 |

## 🎨 代码格式化

项目使用 Prettier 统一代码风格：

- **保存时自动格式化**：已启用
- **格式化配置**：`.prettierrc.json`
- **编码规范**：`.editorconfig`

手动格式化：`Shift+Alt+F` (Windows/Linux) 或 `Shift+Option+F` (macOS)

## 📚 项目结构

```
MindFourm/
├── src/                    # 后端源码
│   ├── main.ts             # 应用入口
│   ├── app.module.ts       # 根模块
│   ├── modules/            # 功能模块
│   ├── entities/           # 数据库实体
│   ├── common/             # 公共代码
│   └── database/           # 数据库配置
├── frontend/               # 前端源码
│   ├── src/                # Next.js 应用
│   ├── public/             # 静态资源
│   └── package.json
├── tests/                  # 测试代码
│   ├── e2e/                # E2E 测试
│   └── *.test.js           # 单元测试
├── docs/                   # 文档
└── .vscode/                # VSCode 配置
    ├── settings.json       # 工作区设置
    ├── launch.json         # 调试配置
    ├── tasks.json          # 任务配置
    └── extensions.json     # 推荐扩展
```

## 🔍 故障排除

### TypeScript 报错

尝试重启 TypeScript 服务器：

1. 按 `Ctrl+Shift+P` / `Cmd+Shift+P`
2. 输入 `TypeScript: Restart TS Server`

### 扩展不生效

重新加载窗口：

1. 按 `Ctrl+Shift+P` / `Cmd+Shift+P`
2. 输入 `Developer: Reload Window`

### 依赖问题

清理并重新安装：

```bash
rm -rf node_modules package-lock.json
npm ci

cd frontend
rm -rf node_modules package-lock.json
npm ci
```

## 📖 更多资源

- [NestJS 文档](https://docs.nestjs.com/)
- [Next.js 文档](https://nextjs.org/docs)
- [TypeORM 文档](https://typeorm.io/)
- [Jest 文档](https://jestjs.io/docs/getting-started)
- [Playwright 文档](https://playwright.dev/)

## 💡 提示

1. **使用 GitLens**：查看代码历史和 blame 信息
2. **使用 REST Client**：在 `.http` 文件中测试 API
3. **使用 Error Lens**：行内显示错误信息
4. **使用 Todo Highlight**：高亮 TODO/FIXME 注释

---

配置完成后，你的 VSCode 应该已经为 MindFourm 项目准备好了！🎉