# Android 客户端现状审计

**审计日期：** 2026-10-09；**对照基线：** 论坛 2.7.12、Public API 契约 1.4.1（`openapi-public-v1.json` 为 1.4.0 快照，changelog 已含 1.4.1）、`openapi-internal-v1.json` 内部快照。
**结论：** 客户端本身不旧，旧的是它与当前平台能力之间的**接缝**。界面代码集中在 `android/app/src/main/java/cn/mdtbbs/android/`，最后一轮功能跟进停留在 M5 之前；此后后端补齐的 `home`、`discover`、`messages`、`friends`、`presence`、`multiplayer`、`game-content`、云存档、Tiptap 富文本，客户端一个都没接。

本文件是审计记录，不是计划书。`M0-android-api-gap.md` 描述一期目标契约，`M0-android-engineering-architecture.md` 描述工程骨架，本文件描述**今天代码与契约的实际差距**。

## 一、总体判断

| 维度 | 现状 | 判断 |
| --- | --- | --- |
| 工程基线 | Kotlin 2.0.21 / AGP 8.7 / Gradle 8.10 / Compose BOM 2024.09 / Room 2.6.1 / Retrofit 2.11 / Hilt 2.52 | 约 2024 年末水平，仍可编译；不算「过时到危险」，但没有版本门禁，也没有 CI 验证 |
| 登录链路 | 自定义 scheme `mdtbbs://oauth/callback` + 自建 `/api/v1/native/auth/*` 密码与短信事务 | **风险最高**：自定义 scheme 在 Android 上可被任意应用抢注；与 `M0-mobile-auth-rfc.md` 要求的 HTTPS App Link 不一致 |
| 主题阅读 | `GET /api/v1/threads`（cursor）+ 分类筛选 + Room/Paging 离线缓存 + 详情/回复/编辑/删除/举报 | 仍是客户端里最完整的一块，方向正确 |
| 主题写入 | 请求体只有 `title` / `content`(Markdown) / `category_id` / `tags` | 缺 `content_json` / `content_schema_version` / `content_language` / `status`(draft) / `server_id` / `post_type` |
| 正文渲染 | 自写 `MarkdownContent`（`ThreadDetailScreen.kt`） | 与站点 Tiptap/ProseMirror 渲染不同源，表格、任务列表、剧透、公式必然漂移 |
| 首页 | 直接消费 `threads` 流 | 未用 `GET /api/v1/home`，缺公告/资源/新闻/开发动态区块 |
| 底部导航 | 首页、分类、搜索、我的 | 站点前台信息架构（2.7.5–2.7.6 起）已是首页、社区、资源、联机、工具、我的，移动端取其中五项 |
| 资源中心 | 扁平列表 + 极简详情 | 未接 `resource_kind` 筛选、类型化详情、版本、文件下载、发现榜单、workbench/编辑器 |
| 社区能力 | 通知（分页轮询）、收藏、个人资料、举报、反馈、公告、LanLink | 未接私信、好友、关注、屏蔽、在线状态、多人联机、云存档 |
| 测试与发布 | 5 个单元测试（`android/app/src/test`），无 MockWebServer、无 Compose UI 测试、无 CI、无 release 变体与签名 | 无法证明它还能编过，也无法发一个包出来 |

## 二、逐功能对照

图例：✅ 已接且方向正确｜⚠️ 接了一半／形态不对｜❌ 完全没接｜🚫 与平台约定冲突

| 平台能力（当前） | 契约入口 | App 状态 | 说明 |
| --- | --- | --- | --- |
| 能力发现 | `GET /v1/capabilities` | ❌ | 客户端一次都没调用。`client/config` 的 `features` 只被读成 `posting`，`image_upload` / `notifications_sse` 丢弃 |
| 客户端配置 | `GET /v1/client/config` | ⚠️ | 有强制更新/维护模式；`android_minimum_version_code` / `android_latest_version_code` / `android_force_update` / `android_maintenance` 四个后端开关在生产没有任何文档 |
| 首页聚合 | `GET /v1/home` | ❌ | 服务端已做故障隔离、分区块 `state`、stale 缓存；客户端仍只拉讨论流 |
| 发现 | `GET /v1/discover` | ❌ | 完全未接 |
| 兼容入口 | `GET /v1/portal` | ❌ | 未接（可继续不接，用 `home` 替代） |
| 主题流 | `GET /v1/threads`（cursor / offset 双形态） | ⚠️ | cursor 分页与 Room 缓存做对了；但固定传空 `cursor` 隐含依赖服务端的 cursor 形态判断（见 `MdtBbsApi.kt` 注释），且首页与分类是两条独立 queryKey |
| 主题详情 | `GET /v1/threads/{id}` | ⚠️ | 只消费 `content` + `content_html` 但不用 HTML；`content_json` / `content_text` / `best_reply_id` / `is_pinned` / 回复分页元数据全部忽略 |
| 回复列表 | `GET /v1/threads/{id}/replies`（**page 分页**） | ❌ | 客户端假设详情内嵌 `replies`。回复一旦翻页，第 21 条之后就看不到；子回复接口 `.../replies/{replyId}/children` 完全未接 |
| 子回复 | `GET /v1/threads/{id}/replies/{replyId}/children` | ❌ | 未接。发子回复时却用 `parent_reply_id` 写，写得出、读不回 |
| 主题写入 | `POST /v1/threads` | ⚠️ | 无草稿（`status` 字段未用）、无 `content_json`、无 `content_language`、无 `server_id` / `post_type` |
| 主题编辑/删除 | `PUT`/`DELETE /v1/threads/{id}` | ✅ | 已有，且区分作者/版主错误文案 |
| 回复写入 | `POST /v1/threads/{id}/replies` | ⚠️ | 只有 Markdown |
| 回复编辑/删除 | `PUT`/`DELETE /v1/threads/{threadId}/replies/{replyId}` | ✅ | `replyId` 用 `Long`，与 OpenAPI 一致 |
| 点赞/收藏 | `PUT`/`DELETE /v1/threads/{id}/like|bookmark` | ✅ | 以目标状态为准，天然幂等 |
| 图片上传 | `POST /v1/uploads/images` | ✅ | 2 MiB 上限、MIME 与扩展名校验都在客户端复刻了一份（服务端才是权威） |
| 附件 | 仅 `api/attachments/upload`（历史内部接口） | ⚠️ | `ThreadDetailRepository` 与 `ThreadDetailScreen` 有 `PendingAttachment` 概念，但走的是历史内部路由，不属于公开契约 |
| 富文本 | Schema v2（`content_format` / `content_json` / `content_schema_version`） | ❌ | 全客户端零处引用；发布与渲染都是 Markdown 单轨 |
| 分类 / 标签 | `GET /v1/categories`、`GET /v1/tags` | ⚠️ | App 调得到，但两者都**不在**公开 OpenAPI 白名单里（`public-v1-operation-allowlist.ts`），内部 OpenAPI 里也是空路径项 |
| 搜索 | `GET /v1/search/posts`、`GET /v1/search` | ⚠️ | 只接 `/search/posts`；`/v1/search` 的 `resource_kind` / `content_language` / 分组能力未接 |
| 个人资料 | `GET /v1/me`、`PUT /v1/me/profile`、`POST /v1/me/avatar` | ✅ | 头像上传带审核提示 |
| 我的内容 | `M0` 规划了 `GET /v1/me/posts`；**当前内部与公开 OpenAPI 都没有** | ❌ | 服务端未实现，M0 文档里这一行已过期。可用 `GET /v1/threads?user_id=` 变通 |
| 收藏列表 | `GET /v1/me/bookmarks` | ✅ | 未接 cursor（该接口当前是 page 分页） |
| 举报 | `POST /v1/reports`、`GET /v1/reports/mine` | ✅ | — |
| 反馈 | `POST /v1/feedback` | ✅ | — |
| 公告 | `GET /v1/notices`、`/v1/notices/{id}` | ✅ | 详情用 `content_markdown` 纯文本渲染，与站点富文本不一致 |
| 通知 | `GET /v1/notifications`、`unread-count`、`read`、`read-all` | ✅ | 分页+加载更多，能标读 |
| 通知实时 | SSE `notifications/events`（历史 `/api` 路由）；公开面另有 WebSocket `/realtime/v1` + `POST /v1/realtime/tickets` | ❌ | `client/config.notifications_sse` 恒为 `false`；客户端只能手动刷新 |
| 私信 | `GET/POST /v1/messages`、`/v1/messages/unread-count`、`/v1/messages/{userId}` | ❌ | 站点产品文档把私信列为现有功能，App 无入口 |
| 好友 | `GET /v1/friends`、`/v1/friends/requests` 等 | ❌ | 未接 |
| 在线状态 | `GET /v1/social/friends/presence`、`POST /v1/presence/connections` | ❌ | 未接 |
| 屏蔽 / 隐私 | `POST/DELETE /v1/users/{id}/block`、`GET /v1/blocks`、`GET/PATCH /v1/social/privacy` | ❌ | 未接。产品文档把屏蔽列为现有功能 |
| 多人联机 | `/v1/multiplayer/*`（会话、邀请、候选、中继） | ❌ | 未接。App 只有 LanLink 房间列表 |
| LanLink 房间 | `GET /v1/lanlink/rooms` | 🚫 | App 在用，但该路由**不在公开白名单**：它存在于内部契约，第三方客户端拿不到公开文档。要么进白名单，要么 App 改用服务端能力开关 |
| 云存档 | `/v1/game-saves/*` | ❌ | 未接（上传中断恢复、配额、冲突、快照都在服务端就绪） |
| 游戏内容 | `/v1/game-content/*`（蓝图代码、地图下载与预览、feed、tags、收藏） | ❌ | 未接。资源详情页只能看标题/摘要/下载数 |
| 资源发现 | `/v1/resources/discovery/{home,hot,for-you,related}` | ❌ | 未接。算法版本、评分、原因字段都没有落点 |
| 资源类型化读取 | `/v1/resources/mods|maps|schematics/{id}/*` | ❌ | 未接（manifest、依赖、分析、版本、关系） |
| 资源编辑器 | `/v1/resources/{id}/versions/{versionId}/editor-data`、`map-editor/region` | ❌ | 站点已有 2.7.11 玩家编辑器；App 侧完全没有承载面 |
| 计数与分页语义 | `published_at` 与 `updated_at` 语义分离（API 1.4.1） | ❌ | App 列表按 `createdAt` 排序、展示 `updatedAt`，没有 `published_at` 概念 |

## 三、必须先清的阻塞项

1. **自定义 scheme 授权**（`mdtbbs://oauth/callback`）。
   `M0-mobile-auth-rfc.md` 明确要求「必须使用已验证的 HTTPS App Link，不可使用裸自定义 scheme」。当前实现同时存在两种登录：走 MindAuth 的 `mdtbbs_android_public`，和走论坛自建 `/api/v1/native/auth/*` 的 `mdtbbs_android` 密码/短信事务。**上线前必须与 MindAuth 注册的客户端对齐**，否则要么授权被拒，要么自定义 scheme 被第三方应用劫持授权码。

2. **客户端长期依赖两条未公开路由**。
   `/v1/lanlink/rooms` 与 `/attachments/upload` 前者在公开白名单外，后者属于历史内部接口。它们不是第三方稳定契约，App 却按稳定接口在用；白名单调整或路由收敛会直接打断 App。

3. **正文格式单向兼容**。
   站点新写入的规范正文是 `tiptap_json`（Schema v2）。客户端只发 Markdown、只读 Markdown 投影，意味着：
   - 新形态内容在 App 里会退化显示（表格、任务列表、剧透、公式、可交互组件）；
   - App 编辑一篇富文本帖子再保存，会把规范正文覆盖回 Markdown 投影。

4. **没有发布与验证闭环**。
   `.cnb.yml` 与 `.github/workflows/ci.yml` 都只构建后端和前端。Android 既没有编译门禁，也没有 release 变体、签名、R8 规则或版本号注入。也就是说：**当前没人能证明这个 App 还能编过，也没人能拿到安装包。**

## 四、按优先级排序的改造建议

排序依据：先消除「会丢数据/会坏」的风险，再补「用户一眼能看出缺失」的能力，最后才是工程完备性。

### P0 — 不修就不该发版

1. 授权链路收口到 HTTPS App Link，删除或明确隔离 `/api/v1/native/auth/*` 客户端注册；两个 `client_id` 收敛为一个。
2. 富文本：写入端发送 `content_json` + `content_schema_version: 2`，读取端按 `content_json` 渲染；Markdown 仅保留为兼容输入。渲染方案与 Web 同源（`frontend/src/lib/tiptap` 的序列化约定），而不是各写一套。
3. 把 `/v1/lanlink/rooms` 与附件上传的判断点收到服务端能力开关，或把它们提升为公开合同；不要在客户端硬依赖未公开路由。
4. 加上 Android CI（`assembleDebug` + 现有单测）与 release 变体、签名（密钥走 CI secret）、版本号注入。

### P1 — 补「能力缺口」，用户可感知

5. 接入 `GET /v1/capabilities` 与完整的 `client/config.features`，所有入口按能力显示/隐藏，未声明即隐藏（fail-closed）。
6. 首页改用 `GET /v1/home`，按 section `state`（`ready`/`stale`/`unavailable`）分别渲染；补 `discover`。
7. 回复分页与子回复：接 `GET /v1/threads/{id}/replies` 与 `.../children`，不要再依赖详情内嵌 `replies`。
8. 草稿（`status: draft`）+ 本地草稿恢复，配合 `Idempotency-Key` 避免超时重发。
9. 私信、好友/关注、屏蔽、在线状态——站点已公开为现有功能，App 是唯一缺口面。
10. 资源中心：列表按 `resource_kind` 分类、类型化详情、版本列表、文件下载（跟随 302）、`published_at` 展示；资源发现榜单作为独立入口。
11. 多人联机与云存档：按 `/v1/multiplayer/*`、`/v1/game-saves/*` 接一版最小可用面。

### P2 — 工程完备性

12. 底部导航从「首页/分类/搜索/我的」调整为与站点一致的五个空间（首页、社区、资源、联机、我的），把搜索放回顶栏。
13. 通知改实时：先评估公开面 WebSocket `/realtime/v1` + `POST /v1/realtime/tickets`（当前要求 `friends.read`，且需要 ticket 流程），而不是等一个恒为 `false` 的 SSE 开关。
14. MockWebServer 契约测试（信封、cursor、401 刷新、错误码、断线重连）+ Compose UI 测试 + 真机报告，补齐自己定的质量门槛。
15. 依赖版本对齐（Compose BOM / Room / Retrofit / Hilt 停更约 8 个月），并移除已无必要的 `android.enableJetifier=true`。

## 五、需要一起修正的文档

- `docs/android/M0-android-api-gap.md` 的「已有能力与缺口」表把下列项目记为「新增 V1」，实际均已落地，需更正：性别分类/标签、举报、通知、图片上传、Mobile Auth、threads 读写、bookmarks。同表的 `GET /api/v1/me/posts` 至今不存在。
- `docs/android/M0-android-engineering-architecture.md` 的底部导航约定（首页、分类、发布、通知、我的）与站点 2.7.5–2.7.6 之后的移动端五项布局不一致。
- `docs/api/API_ENDPOINTS.json` / `docs/api/API_REFERENCE.md` 生成于 2026-08-30，已显著落后：`/api/v1` 仅收录 21 条，`/v1/categories`、`/v1/tags` 打印为空路径项，`/v1/home`、`/v1/discover`、`/v1/messages`、`/v1/friends`、`/v1/presence/*`、`/v1/multiplayer/*`、`/v1/game-saves/*` 全部缺失。该快照不是当前契约证据，客户端不应据此判断能力有无。
- `docs/product/overview.md` 与 `changelog.md` 已把私信、云存档、多人联机、玩家编辑器列为现有能力；Android 是唯一完全没有覆盖面的官方客户端，对外描述前需要说明这一边界。

## 相关文档

- [M0 API 缺口清单](./M0-android-api-gap.md)
- [M0 工程目录与实现约定](./M0-android-engineering-architecture.md)
- [Mobile Auth RFC](./M0-mobile-auth-rfc.md)
- [第三方客户端接入指南](../api/public-client-v1.md)
- [论坛 API V1 参考](../api/first-party-v1.md)
