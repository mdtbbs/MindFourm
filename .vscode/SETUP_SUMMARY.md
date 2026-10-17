# VSCode 开发环境配置总结

本文档总结了为 MindFourm 项目配置的 VSCode 开发环境。

## ✅ 已创建的配置文件

### 1. VSCode 核心配置

| 文件 | 说明 |
|------|------|
| `.vscode/settings.json` | 工作区设置：格式化、TypeScript、ESLint、文件关联等 |
| `.vscode/launch.json` | 调试配置：后端、前端、Jest、Playwright 等 |
| `.vscode/tasks.json` | 任务配置：构建、测试、迁移、OpenAPI 等 |
| `.vscode/extensions.json` | 推荐扩展列表：20+ 个开发工具扩展 |
| `.vscode/typescript.code-snippets` | TypeScript 代码片段：NestJS、TypeORM、Jest、React 等 |
| `.vscode/README.md` | 配置指南：详细的安装和使用说明 |
| `.vscode/CHEATSHEET.md` | 开发备忘单：常用命令和快捷键 |

### 2. 项目配置

| 文件 | 说明 |
|------|------|
| `.editorconfig` | 跨编辑器的编码风格配置 |
| `.prettierrc.json` | Prettier 代码格式化配置 |
| `.prettierignore` | Prettier 忽略文件列表 |
| `.nvmrc` | Node.js 版本声明 (20.11.0) |
| `volta.json` | Volta Node.js 版本管理配置 |
| `MindFourm.code-workspace` | VSCode 多根工作区文件 |

### 3. 工具脚本

| 文件 | 说明 |
|------|------|
| `scripts/setup-vscode.sh` | 一键设置开发环境脚本 |
| `tests/api.http` | REST Client API 测试集合 |

## 🎯 配置特性

### 自动化功能

- ✅ 保存时自动格式化代码
- ✅ 保存时自动修复 ESLint 错误
- ✅ TypeScript 增量编译
- ✅ Jest 测试集成
- ✅ Git 自动 fetch

### 调试支持

- ✅ NestJS 后端调试（dev/debug 模式）
- ✅ Next.js 前端调试（Chrome 集成）
- ✅ Jest 单元测试调试
- ✅ Playwright E2E 测试调试
- ✅ 数据库迁移调试
- ✅ 脚本调试
- ✅ 全栈同时调试

### 任务自动化

- ✅ 构建：后端、前端、全栈
- ✅ 测试：单元测试、E2E 测试、监听模式
- ✅ 代码质量：lint、typecheck
- ✅ 数据库：迁移管理
- ✅ OpenAPI：导出、检查
- ✅ 清理：构建产物、依赖

### 开发体验

- ✅ 20+ VSCode 扩展推荐
- ✅ NestJS/TypeORM/Jest/React 代码片段
- ✅ 文件图标主题
- ✅ Git 增强工具
- ✅ REST Client API 测试
- ✅ 实时错误提示
- ✅ TODO 高亮

## 📋 使用步骤

### 1. 安装扩展

在 VSCode 中打开项目时，会自动提示安装推荐扩展。

或者手动安装：
1. 按 `Ctrl+Shift+X` (Windows/Linux) 或 `Cmd+Shift+X` (macOS)
2. 输入 `@recommended`
3. 点击"安装工作区推荐扩展"

### 2. 运行设置脚本

```bash
# 可选：运行自动化设置脚本
bash scripts/setup-vscode.sh
```

这个脚本会：
- 检查 Node.js 版本
- 安装所有依赖
- 创建环境变量文件
- 构建项目
- 运行类型检查

### 3. 配置环境变量

```bash
# 复制环境变量示例文件
cp .env.example .env

# 编辑 .env 文件
# 填写数据库连接、Redis、JWT 密钥等配置
```

### 4. 启动开发

#### 方法一：使用调试面板

1. 按 `F5` 打开调试面板
2. 选择调试配置：
   - `Full Stack: Dev` - 同时启动前后端
   - `Backend: Dev Server` - 仅后端
   - `Frontend: Dev Server` - 仅前端

#### 方法二：使用终端

```bash
# 终端 1: 启动后端
npm run dev

# 终端 2: 启动前端
cd frontend && npm run dev
```

## 🎨 推荐的扩展列表

### 必装扩展

| 扩展 | 用途 |
|------|------|
| ESLint | 代码质量检查 |
| Prettier | 代码格式化 |
| vscode-icons | 文件图标主题 |
| GitLens | Git 增强 |
| REST Client | API 测试 |

### 开发增强

| 扩展 | 用途 |
|------|------|
| Tailwind CSS IntelliSense | Tailwind CSS 智能提示 |
| Error Lens | 行内错误提示 |
| Better Comments | 更好的注释高亮 |
| Path Intellisense | 路径自动补全 |
| DotENV | .env 文件支持 |

### 测试工具

| 扩展 | 用途 |
|------|------|
| Jest Runner | Jest 测试运行器 |
| Playwright Test | E2E 测试工具 |

### 其他工具

| 扩展 | 用途 |
|------|------|
| Docker | Docker 支持 |
| PostgreSQL | 数据库管理 |
| YAML | YAML 文件支持 |
| i18n Ally | 国际化工具 |
| TODO Highlight | TODO 高亮 |

## 🚀 开发流程建议

### 日常开发

1. **启动项目**
   - 按 `F5`，选择 `Full Stack: Dev`
   - 或使用终端：`npm run dev` + `cd frontend && npm run dev`

2. **编写代码**
   - 利用代码片段快速生成代码
   - 保存时自动格式化
   - 实时查看错误提示

3. **测试代码**
   - 单元测试：右键点击测试文件 → "Debug Jest Test"
   - E2E 测试：按 `F5` → "Playwright: Debug Current File"

4. **提交代码**
   - 使用 GitLens 查看更改
   - 运行 `npm run lint` 和 `npm run typecheck:frontend`
   - 提交前确保所有测试通过

### 数据库迁移

1. 创建迁移文件（手动创建）
2. 按 `Ctrl+Shift+P` → "Tasks: Run Task" → `migration:run`
3. 检查迁移结果

### API 开发

1. 使用 `tests/api.http` 测试 API
2. 导出 OpenAPI：`npm run openapi:export`
3. 检查 API 变更：`npm run openapi:check`

## 📚 文档资源

- **VSCode 配置指南**: `.vscode/README.md`
- **开发备忘单**: `.vscode/CHEATSHEET.md`
- **项目文档**: `docs/README.md`
- **API 文档**: http://localhost:5100/api/v1 (启动后访问)

## 🔄 更新配置

配置文件应该随项目一起提交到 Git。如果需要更新：

1. 修改对应的配置文件
2. 提交更改到 Git
3. 团队成员拉取更新后会自动应用

## 🆘 常见问题

### 扩展不生效

重新加载窗口：`Ctrl+Shift+P` → "Developer: Reload Window"

### TypeScript 报错

重启 TS Server：`Ctrl+Shift+P` → "TypeScript: Restart TS Server"

### 格式化不生效

检查是否安装了 Prettier 扩展，并设置为默认格式化工具。

### 调试失败

检查 `launch.json` 中的配置是否正确，特别是 `runtimeExecutable` 和 `runtimeArgs`。

## 🎉 总结

通过这些配置，你将获得：

- ⚡ 高效的开发体验
- 🔍 强大的调试能力
- 📝 一致的代码风格
- 🧪 完整的测试支持
- 🚀 自动化的工作流

祝你开发愉快！🎊

---

配置创建时间: 2026-10-17
配置版本: 1.0.0