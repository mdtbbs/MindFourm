# MindFourm — AI 开发上下文

OAuth 应用有两个访问层级：基础 MindAuth 登录或论坛授权。统一的 Bearer 解析器在账户查询前拒绝纯身份令牌，并将已验证的论坛授权扩展为现有操作范围。旧版窄令牌保留其范围；Presence/Multiplayer 不再使用应用目录能力审批作为授权关卡。用户权限和站点开关仍然适用。


本文件是 MindFourm 仓库的当前工程上下文。涉及接口、数据库、部署和功能状态时，先以代码与下方标注的现行文档为准；历史计划和旧版参考不能作为当前实现证据。

## 文档地图

- [`docs/README.md`](docs/README.md)：中文文档索引和阅读入口。
- `docs/product/*.md`：面向论坛用户与开发者的功能概览、产品更新日志和公开计划；在线入口为 `/api/v1/docs/product-*`。
- [`docs/api/README.md`](docs/api/README.md)：Public V1 边界、认证、响应、OpenAPI 和客户端文档入口。
- `docs/api/*.md`：Public V1 OAuth/PKCE、资源、游戏内容、多人联机（含[第三方联机接入指南](docs/api/multiplayer-guide.md)）、云存档、错误码、富文本、Changelog 和生命周期契约。公开导航按 Public API / Infrastructure-only 分栏；服务端集成、Relay Agent 机器接口与 LanLink 管理接口不进入公开导航。
- [`docs/resource-storage.md`](docs/resource-storage.md)：RES 上传、binding 生命周期、历史兼容及手动迁移。
- [`docs/resource-storage-reconciliation.md`](docs/resource-storage-reconciliation.md)：Forum↔RES 对账、审计和显式修复边界。
- [`docs/resource-center-v2.md`](docs/resource-center-v2.md)：Resource Center V2 的资源、版本、成员、审核、分析、manifest 与接口。
- [`docs/schematic-editor.md`](docs/schematic-editor.md)、[`docs/map-editor.md`](docs/map-editor.md)：官方 renderer 编辑器的安全范围和已知限制。
- [`docs/platform-2.7.0.md`](docs/platform-2.7.0.md)：2.7.0 平台能力收口与证据层。
- [`docs/international-site-profiles.md`](docs/international-site-profiles.md)：`mdtbbs` 与 `mindustry-club` 部署配置及隔离要求。
- [`docs/production-deployment.md`](docs/production-deployment.md)：生产配置、迁移和发布检查；执行前仍需核对当前代码和部署状态。
- `docs/design/`：设计背景。逐项确认是否与当前实现一致后才可用于实施。
- `docs/superpowers/plans/`、`docs/superpowers/specs/`：历史方案，不代表当前状态。

## 项目结构与事实来源

- NestJS 后端入口为 `src/main.ts`；根模块注册在 `src/app.module.ts`。
- 后端模块位于 `src/modules/`；实体注册维护在 `src/entities/index.ts`；TypeORM 迁移从 `src/database/migrations/` 注册。
- Next.js 前端位于 `frontend/`。共享站点配置数据在 `src/config/site-profile-data.ts` 和 `frontend/src/config/site-profile.ts`。
- 不要手动统计模块或实体的数量。当确切结构重要时，请阅读 `src/app.module.ts`、`src/entities/index.ts` 和 `src/modules/`。
- 论坛业务数据与 Resource 聚合与文件字节分离。`ResourceStorageClientService` 将新的持久资源字节存储在 RES；`ResourceStorageService` 保留临时暂存和历史本地兼容性，而 `ResourceFileProviderService` 选择 RES、托管、MFL 或外部交付。在部署使用文件服务的场景下，将大二进制传输避开主论坛 web 路径。Resource API 不是通用对象存储；RES 拥有内容寻址对象和去重；论坛删除移除绑定，永不删除共享 CAS 对象。

## Public API 契约

- 稳定的第一方/公开客户端契约是显式过滤后的 Public V1 OpenAPI，而非 URL 中包含 `/v1` 的所有控制器。
- 运行时 API 路径使用 `/api/v1/*`。其他 `/api/*` 路由为遗留、第一方兼容、管理或内部路由，除非另行文档化。`/api/external/v1/*` 是单独认证的服务端集成面，而非第三方客户端 API。
- 当 `OPENAPI_ENABLED` 不为 `false` 时，运行时文档服务于 `/api/v1`、`/api/v1/reference`、`/api/v1/docs/*`；公开机读 JSON 服务于 `/api/openapi/v1.json` 和 `/api/openapi/public-v1.json`。
- `openapi-v1.json` 和 `openapi-public-v1.json` 是公开契约与兼容镜像；`openapi-internal-v1.json` 是开发快照，并非公开 API。
- 若 Public V1 OpenAPI 契约文件变更，须在同一 PR 中更新 `docs/api/changelog-v1.md`。CI 通过 `scripts/check-api-changelog.cjs` 强制执行；`npm run openapi:check` 可独立验证生成契约漂移。
- 保留现有 Public V1 操作，包括已文档化的 Messages 操作。切勿仅为了让文档链接工作而将遗留控制器加入公开白名单。
- Public V1 成功/错误 JSON 信封为 `{ data, meta }` 和 `{ error, meta }`；使用稳定的 `error.code` 和 HTTP 状态码进行控制流。文件和重定向响应可为原始 HTTP 响应。

## 富文本内容

- 帖子、回复、资源和支持的长文本字段使用 Tiptap/ProseMirror 富文本。规范格式为 `content_format: "tiptap_json"`、`content_schema_version` 和 `content_json`（当前新写入使用 Schema v2）。
- 前端编辑器 schema 和序列化器位于 `frontend/src/lib/tiptap/`；后端验证、规范化、安全 HTML 渲染、文本提取和 Markdown 转换位于 `src/common/utils/` 及相关模块写入服务。
- `content_html` 和 `content_text` 是派生投影。Markdown `content` 保留用于遗留输入和兼容/搜索/通知/RSS/纯文本用途；Markdown 不是新写入的规范格式。
- 纯 Markdown 遗留请求在兼容路径上仍然接受并转换为富 JSON 形式。批量转换由 `src/scripts/content-json-backfill.ts` 单独实现；无部署证据时，不得声称所有生产行已回填。
- 保持前端编辑器、后端验证/序列化、OpenAPI DTO 与 `docs/api/rich-content-schema-v2.md` 的 schema 变更同步。

## Resource Center V2

- Resource V2 扩展现有 Resource 聚合；Mod、Map 和 Schematic 是一等资源类型，而非次级附件。
- `ResourceVersion` 存储不可变修订。发布已使用的显示版本会创建新修订，而非覆盖已发布文件。
- 当前 V2 契约包括公开 UUID 标识符（`public_id`）、所有者/成员角色和邀请、审核事件和批注、兼容性和依赖、版本分析、类型特定 manifest、GitHub Release 源同步，以及 Mod/Map/Schematic 读取 API。
- 上传进入隔离/待审状态，仅在审核决策后发布。审核、批准和存储转换在 Resource V2 服务中实现；当审核失败或被拒绝时保留隔离文件。
- 论坛存储 Resource 业务元数据、所有权、版本和审核状态。文件存储处理二进制生命周期和交付。保持 Resource API 行为显式且面向资源；不要将其呈现为通用 blob API。
- 元数据优先直接上传保持浏览器字节在 ResourceStorage 上；Forum 完成必须重新读取权威对象元数据，然后才创建待定私有绑定。ResourceStorage 对账由管理员触发，记录请求/完成操作日志，且永不自动删除对象。
- 基于 renderer 的蓝图/地图编辑总是导出新版本。能力标志在协议、固定运行时摘要、操作白名单和 RES 健康检查上采用失败关闭策略；不要将不支持的地图图层或未知蓝图配置描述为可编辑。
- Resource V2 迁移和任何必需的回填需要单独的生产验收。不得从本地迁移或源码构建推断生产 schema/数据就绪。

## 下载事件与分析

- `DownloadEvent` 是 `src/entities/download-event.entity.ts` 中的 TypeORM 实体；数据库持久化 `requested`、`granted`、`started`、`completed` 和 `failed` 生命周期事件。
- `DownloadGrantService` 记录 requested/granted 事件，使用数据库去重表和 60 秒滚动窗口对授权去重，并仅对新授权增加 Resource 聚合（`resources.download_count`，授权/授权计数器）。`DownloadEventsService` 记录传输生命周期结果，并使用自然分钟桶（`DEDUP_BUCKET_MS`）对 `completed` 行去重——而非滚动窗口。
- `StatsService` 按时间范围聚合持久化的 `completed`/`failed` 计数；管理后台展示下载和相关范围指标。用户可见的"下载"数字仅统计 `completed`（完成写入其响应体的流）——裸授权不算下载。`resources.download_count` 有意保留其 ADR-009 授权语义，因此公开卡片和排名显示授权数而非完成数；应相应标注，而非将两个数字呈现为一个指标。不要将下载跟踪描述为仅内存。

## 网络封禁

- `src/modules/bans/bans.service.ts` 规范化 IPv4 和 IPv6 地址，验证 IPv4 和 IPv6 CIDR 前缀，并仅比较同族地址。`src/modules/bans/bans.service.spec.ts` 覆盖 IPv6 规范化、CIDR 验证和匹配。不要声称 IPv6 CIDR 不支持。

## 数据库与迁移

- 使用 `src/database/migrations/` 中的显式 TypeORM 迁移注册表。在应用和 CLI DataSource 上保持 `synchronize: false`；不要使用运行时 schema 同步作为迁移替代。
- 应用 DataSource 当前设置 `migrationsRun: true`，因此待处理的已跟踪迁移在应用初始化期间运行。生产发布流程应使用 `npm run migration:show` 检查，将迁移执行设为显式发布关卡（通常在服务启动前 `npm run migration:run`），然后验证结果迁移状态。初始基线迁移有特殊的空 schema 引导路径；这不是启用通用 `synchronize` 的许可。
- Resource V2 schema 迁移和数据回填必须针对目标生产数据库单独审查和验收。不要在普通文档工作中运行生产迁移或回填。

## 站点配置

后端 `SITE_PROFILE` 与前端构建时的 `NEXT_PUBLIC_SITE_PROFILE` 必须匹配。每个配置是一个部署，而非运行时多租户；使用独立的数据库、Redis、上传根目录、OAuth 客户端和凭证。

| 配置 | 语言区域与验证 | 配置特定功能 |
| --- | --- | --- |
| `mdtbbs` | 中文（`zh-CN`）；社区写入需验证手机；邮箱验证不是配置关卡 | LanLink、开发者动态和服务器应用/目录按配置启用；备案适用 |
| `mindustry-club` | 默认英文，支持俄语和日语；写入需邮箱验证；手机验证不要求 | 服务器应用、LanLink、开发者动态和备案禁用；开发者文档启用 |

运行时设置和功能标志可进一步禁用功能。在描述开关为普遍启用前，检查 `src/config/site-profile-data.ts`、`frontend/src/config/site-profile.ts` 和 `src/modules/settings/`。

## 已知产品缺口

- 投票功能未实现。
- 群聊没有完整的用户面向聊天体验。
- 插件前端主题/模板注入和热重载未实现。
- 通用 blob API 存在于 `/api/v1/blobs`（`src/modules/blobs`，默认关闭，由 `blobs_enabled` 控制）。它与 ResourceStorage 是独立存储：调用者提供命名空间/键/元数据，它拥有内容去重、引用计数、所有者绑定和延迟回收。资源上传仍使用上文文档化的 ResourceStorage CAS、绑定、GC 和对账契约。不要将资源二进制路由到 `/v1/blobs`——资源需要版本、审核和下载授权，这些 blobs 刻意不实现。

不要将已实现的仪表板下载分析、IPv6 CIDR、Resource 公开 UUID 或 Tiptap 存储报告为未完成工作。

## 开发与完成定义

使用 CI 中的 Node.js 20。在仓库根目录用 `npm ci` 安装依赖，需要前端包时在 `frontend/` 中执行 `npm ci`。

后端/API 变更应运行：

```bash
npm run build:backend
npm test -- --runInBand
npm run openapi:check
npm run test:api-changelog
```

前端变更应运行：

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

涉及 Resource 或用户关键流程的变更，在隔离本地环境可用时应运行相关 Playwright E2E 覆盖：

```bash
npm run test:e2e -- --project=chromium tests/e2e/product-smoke.spec.ts tests/e2e/resource.spec.ts tests/e2e/resource-v2-review.spec.ts
```

跳过或阻塞的命令不是通过的检查；报告准确结果和限制。E2E 全局清理会从配置的 MySQL 数据库删除匹配其测试前缀的行，因此运行前请验证数据库已隔离。

交付前运行 `git diff --check` 并检查 `git status`。保留无关工作。除非用户显式要求该运维工作，否则不要运行生产迁移、回填或部署。