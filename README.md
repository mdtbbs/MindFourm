# MindFourm

MindFourm 是 Mindustry 社区论坛和资源中心，使用 NestJS、Next.js、MySQL、Redis，并集成 MindAuth OAuth 与 MindFileList 文件服务。

## 当前能力

- 讨论、回复、通知、私信、好友、关注、屏蔽、群组和管理后台。
- Resource Center V2：Mod、Map、Schematic、不可覆盖的版本 revision、成员/所有权、审核事件、兼容性、依赖、分析、manifests 和 GitHub Release 来源同步。
- ResourceStorage metadata-first direct upload、对象/绑定对账和安全修复审计；对账不会自动删除对象或历史文件。
- 官方 renderer-backed 蓝图/地图轻编辑器：编辑结果总是新版本并重新进入审核；能力开关在 renderer/RES 不满足时关闭。
- viewer-aware 统一搜索、资源过滤、建议/纠错，以及好友隐私、邀请、加入请求和可恢复 realtime。
- 游戏内容 API：地图和蓝图读取、投稿、预览、下载、收藏、点赞与上传会话。
- Tiptap rich content：新正文以 `tiptap_json` / `content_json` 和 schema version 表示；旧 Markdown 请求仍可通过兼容路径转换，Markdown 是兼容输入和派生文本投影。
- 下载生命周期写入数据库，包含 requested、granted、started、completed、failed；grant 使用数据库去重。管理统计读取持久化下载数据。
- IPv4 与 IPv6 CIDR 封禁匹配。
- EasyManager 集成默认关闭，可通过站点及功能设置管理。

## 暂未实现或未提供完整体验

- 投票。
- 完整群聊用户体验。
- 插件前端主题/模板注入与无需重启的热加载。
- 面向任意业务的通用 blob API；ResourceStorage 已提供资源文件的 CAS 去重、binding 和显式 GC/对账流程。

不要将以上列表扩展成未经代码核实的功能状态；模块、实体和开关以仓库源代码为准。

## 站点配置

同一代码库通过站点 profile 支持两个相互隔离的部署，不是运行时多租户。后端 `SITE_PROFILE` 与前端构建变量 `NEXT_PUBLIC_SITE_PROFILE` 必须匹配。

| 站点 | Profile | 默认语言 | 社区写入验证 | Profile 功能差异 |
| --- | --- | --- | --- | --- |
| MDTBBS | `mdtbbs` | 简体中文 | 需要已验证手机号 | LanLink、开发动态、服务器申请和国内备案功能启用 |
| Mindustry Club | `mindustry-club` | English，另支持 Русский / 日本語 | 需要邮箱，不要求手机号 | 不启用 LanLink、开发动态、服务器申请和国内备案功能；提供开发者入口 |

两站应使用独立 MySQL 数据库、Redis、上传目录、OAuth Client、备份和运维凭据。站点示例与数据隔离见 [`docs/international-site-profiles.md`](docs/international-site-profiles.md)。后台运行时 feature flag 可进一步关闭 profile 功能。

## 快速开始

需要 Node.js 20、MySQL 8 和 Redis 7。先复制 `.env.example`，配置数据库、Redis、MindAuth、站点 profile 和文件服务。

```bash
npm ci
npm run dev
```

前端：

```bash
cd frontend
npm ci
npm run dev
```

## 数据库

数据库结构由 TypeORM migrations 管理；DataSource 使用 `synchronize: false`。生产发布前先备份并检查待执行项，再通过显式迁移步骤执行和确认：

```bash
npm run migration:show
npm run migration:run
```

应用 DataSource 当前配置 `migrationsRun: true`，因此启动时也会执行未应用的 tracked migration；生产发布仍应将迁移审查、执行和验证作为独立发布门禁。Resource Center V2 的 migration/backfill 需要在目标环境单独验收。

## API 文档

- Public V1 文档：`/api/v1`
- API 参数参考：`/api/v1/reference`
- 公开 API 更新记录：`/api/v1/docs/changelog`
- API 生命周期：`/api/v1/docs/lifecycle`
- 错误代码：`/api/v1/docs/errors`
- 机器可读 OpenAPI：`/api/openapi/v1.json`

第三方稳定契约是被明确纳入 Public V1 OpenAPI 的操作。其他 `/api/*` 路由属于旧版、论坛兼容、管理或内部能力，不能只凭路由存在就作为第三方契约。完整入口见 [`docs/api/README.md`](docs/api/README.md)。Public V1 OpenAPI 改动必须在同一 PR 更新 [`docs/api/changelog-v1.md`](docs/api/changelog-v1.md)，CI 会检查。

## 测试与验收

CI workflow 配置了后端构建和 Jest、Public V1 OpenAPI 检查、前端 lint/typecheck/build，以及 renderer 相关作业。CI 的通过状态以对应分支的实际 workflow 结果为准；本 README 不代表某次提交已经通过测试。

常用本地命令：

```bash
npm run build:backend
npm test -- --runInBand
npm run openapi:check
npm run test:api-changelog
```

前端：

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

涉及 Resource 或用户关键流程的变更还应运行相关 Playwright E2E。没有运行、被环境阻塞或无设备验证的检查不能报告为通过。

## 更多文档

- [`docs/README.md`](docs/README.md)：仓库中文文档索引。
- [`CLAUDE.md`](CLAUDE.md)：AI 开发上下文与当前实现边界。
- [`docs/resource-center-v2.md`](docs/resource-center-v2.md)：Resource Center V2 契约与行为。
- [`docs/platform-2.7.0.md`](docs/platform-2.7.0.md)：2.7.0 收口范围和已知限制。
- [`docs/resource-storage-reconciliation.md`](docs/resource-storage-reconciliation.md)：RES 对账与安全修复。
- [`docs/production-deployment.md`](docs/production-deployment.md)：生产部署清单。
