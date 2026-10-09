# MindFourm 文档索引

按任务选择当前文档入口。实现状态以代码和 OpenAPI 为准；设计草案与历史计划仅用于了解背景。

## 面向用户与第三方开发者

- [`product/overview.md`](product/overview.md)：论坛功能概览与从 1.0 开始的主要演进里程碑。
- [`product/changelog.md`](product/changelog.md)：面向用户的产品更新记录，按论坛版本从新到旧排列。
- [`product/roadmap.md`](product/roadmap.md)：已公开的研发方向、计划边界和功能下线公告。
- [`VERSION_RULE.md`](VERSION_RULE.md)：论坛版本号规则、递增时机与发布操作。

## API 与客户端

- [`api/README.md`](api/README.md)：Public V1 边界、文档入口与维护规则。
- [`api/public-client-v1.md`](api/public-client-v1.md)、[`api/authentication.md`](api/authentication.md)：客户端接入、OAuth/PKCE。
- [`api/first-party-v1.md`](api/first-party-v1.md)、[`api/game-content-v1.md`](api/game-content-v1.md)、[`api/resources-v1-contract.md`](api/resources-v1-contract.md)：讨论、游戏内容与资源 API；资源契约也记录公开推荐算法及其分页、信号与隐私边界。
- [`api/multiplayer-v1.md`](api/multiplayer-v1.md)、[`api/cloud-saves-v1.md`](api/cloud-saves-v1.md)：联机与云存档。
- [`api/rich-content-schema-v2.md`](api/rich-content-schema-v2.md)：Tiptap 正文 Schema。
- [`api/errors-v1.md`](api/errors-v1.md)、[`api/changelog-v1.md`](api/changelog-v1.md)、[`api/lifecycle-v1.md`](api/lifecycle-v1.md)：错误码、已发布 API 更新与生命周期。

## 移动客户端

- [`android/ANDROID-CLIENT-STATUS.md`](android/ANDROID-CLIENT-STATUS.md)：Android 客户端逐功能审计、与当前 V1 契约的差距、阻塞项和分级改造建议。
- [`android/M0-android-api-gap.md`](android/M0-android-api-gap.md)、[`android/M0-android-engineering-architecture.md`](android/M0-android-engineering-architecture.md)、[`android/M0-mobile-auth-rfc.md`](android/M0-mobile-auth-rfc.md)：一期 API 缺口、工程约定与移动认证 RFC；已接受但部分内容早于当前实现，读前先看审计文件。

## 当前系统与运维

- [`frontend/FRONTEND_IA_2.md`](frontend/FRONTEND_IA_2.md)、[`frontend/FRONTEND_IA_2_ROUTES.md`](frontend/FRONTEND_IA_2_ROUTES.md)、[`frontend/FRONTEND_IA_2_AUDIT.md`](frontend/FRONTEND_IA_2_AUDIT.md)：前台信息架构、route map 与现状审计。

- [`resource-center-v2.md`](resource-center-v2.md)：Resource Center V2 业务与 API。
- [`platform-2.7.0.md`](platform-2.7.0.md)：2.7.0 平台能力收口、证据层和已知限制。
- [`schematic-editor.md`](schematic-editor.md)、[`map-editor.md`](map-editor.md)：蓝图/地图安全编辑器边界与版本流程。
- [`resource-storage-reconciliation.md`](resource-storage-reconciliation.md)：ResourceStorage 对账、审计和显式修复。
- [`resource-storage.md`](resource-storage.md)：RES 直传、下载、预览和历史迁移合同。
- [`international-site-profiles.md`](international-site-profiles.md)：MDTBBS / Mindustry Club profile 差异及部署隔离。
- [`production-deployment.md`](production-deployment.md)：生产配置、数据库迁移和发布检查。
- [`production-readiness.md`](production-readiness.md)：生产就绪背景与验收记录；执行操作前重新核实当前状态。

## 设计背景

`design/` 包含较早的系统设计和功能方案。若其中描述与实现不同，以当前源代码、OpenAPI 和本索引列出的运行文档为准。`superpowers/plans/` 与 `superpowers/specs/` 是历史计划和规格，不代表当前完成状态。
