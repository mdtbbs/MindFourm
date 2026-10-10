# Android 客户端现状审计

**审计日期：** 2026-10-09（第二轮复核同日完成）；**对照基线：** 论坛 2.7.12、`src/openapi/public-v1-operation-allowlist.ts` 当前白名单（231 条操作 / 195 条路径）、仓库内 `openapi-public-v1.json` 与 `openapi-internal-v1.json` 快照、`android/` 当前代码。

本文件是审计记录，不是计划书。改造顺序与验收见 [`ANDROID-DEVELOPMENT-PLAN.md`](./ANDROID-DEVELOPMENT-PLAN.md)；一期目标契约见 [`M0-android-api-gap.md`](./M0-android-api-gap.md)；工程骨架见 [`M0-android-engineering-architecture.md`](./M0-android-engineering-architecture.md)。

> 上一版审计（同日早前）有两处判断是错的，本版已更正：**Android 已进入 CI**（`.github/workflows/ci.yml` 的 `android` job 会跑 `:app:testDebugUnitTest :app:assembleDebug`），以及客户端调用的接口并非「多数未公开」。逐条依据见文末「上一版审计的更正」。

## 一、总体判断

| 维度 | 现状 | 判断 |
| --- | --- | --- |
| 工程基线 | Kotlin 2.0.21 / AGP 8.7.0 / Gradle 8.10 / Compose BOM 2024.09.03 / Room 2.6.1 / Retrofit 2.11 / Hilt 2.52 | 约 2024 年末水平，可用；无依赖更新门禁 |
| 编译门禁 | GitHub Actions `android` job：API 35 SDK + `testDebugUnitTest` + `assembleDebug` | **有门禁**。CNB `.cnb.yml` 的 backend / frontend 两条流水线不含 Android，CNB 侧目前没有 Android 检查 |
| 登录链路 | 三套并存：MindAuth OAuth（`mdtbbs_android_public`）+ 自建 `/api/v1/native/auth/*` 事务（`mdtbbs_android`）+ 论坛 `/api/token` 公开 OAuth | **风险最高**。见阻塞项 1 |
| 主题阅读 | `GET /v1/threads`（cursor）+ 分类筛选 + Room/Paging 离线缓存 + 详情/回复/编辑/删除/举报 | 仍是客户端里最完整的一块，方向正确 |
| 主题写入 | 请求体只有 `title` / `content`(Markdown) / `category_id` / `tags` | 缺 `content_json` / `content_schema_version` / `content_language` / `status`(draft) / `server_id` / `post_type` / `required_group_id` |
| 正文渲染 | 自写 `MarkdownContent`（`feature/post/ThreadDetailScreen.kt`） | 与站点 Tiptap/ProseMirror 渲染不同源，表格、任务列表、剧透、公式必然漂移 |
| 首页 | 直接消费 `threads` 流 | 未用 `GET /v1/home`，缺公告/资源/新闻/开发动态等区块 |
| 底部导航 | 首页、分类、搜索、我的（`navigation/MdtBbsNavGraph.kt`） | 站点前台自 2.7.5–2.7.6 起为首页、社区、资源、联机、工具、我的 |
| 资源中心 | 扁平列表 + 极简详情（`feature/community/CommunityScreens.kt`） | 未接 `resource_kind` 筛选、类型化详情、版本、文件下载、发现榜单、workbench |
| 社区能力 | 通知（page 轮询）、收藏、个人资料、举报、反馈、公告、LanLink | 未接私信、好友、关注、屏蔽、在线状态、多人联机、云存档 |
| 测试 | 5 个测试类 21 个用例（`android/app/src/test`） | 无 MockWebServer 契约测试、无 Compose UI 测试；`V1ContractTest` 是当前唯一契约级回归 |
| 发布 | 只有 debug 变体，无 release/签名/R8/版本号注入 | **拿不到可分发安装包**，CI 也只证明能编 debug |

## 二、逐功能对照

图例：✅ 已接且方向正确｜⚠️ 接了一半／形态不对｜❌ 完全没接｜🚫 依赖未公开路由。

| 平台能力（当前） | 契约入口 | 白名单 | App 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 能力发现 | `GET /v1/capabilities` | ✅ | ❌ | 客户端一次都没调用。`client/config` 的 `features` 只被读成 `posting`，`image_upload` / `notifications_sse` 丢弃 |
| 客户端配置 | `GET /v1/client/config` | ✅ | ⚠️ | 有强制更新/维护模式；`android_minimum_version_code` / `android_latest_version_code` / `android_force_update` / `android_maintenance` 四个后端开关在生产没有任何文档 |
| 首页聚合 | `GET /v1/home` | ✅ | ❌ | 服务端已做分区块故障隔离与 stale 缓存；客户端仍只拉讨论流 |
| 发现 | `GET /v1/discover` | ✅ | ❌ | 未接 |
| 兼容入口 | `GET /v1/portal` | ✅ | ❌ | 未接（可继续不接，用 `home` 替代） |
| 主题流 | `GET /v1/threads`（cursor / offset 双形态） | ✅ | ⚠️ | cursor 分页与 Room 缓存做对了，但固定传空 `cursor` 完全依赖服务端「有 cursor 参数即走 cursor 形态」的分支判断；cursor 模式还漏用 `user_id` / `content_language` / `server_id` / `sort` / `order` / `exclude_category_ids` |
| 主题详情 | `GET /v1/threads/{id}` | ✅ | ⚠️ | 只消费 `content` + `content_html`（后者拿到不用）；`content_json` / `content_text` / `best_reply_id` / `prefix` / `is_owner` / `reply_pagination` 全部忽略 |
| 回复列表 | `GET /v1/threads/{id}/replies`（page 分页） | ✅ | ❌ | 客户端假设详情内嵌 `replies`。第 21 条之后看不到；命中 `children` 接口缺失见下一行 |
| 子回复 | `GET /v1/threads/{id}/replies/{replyId}/children` | ✅ | ❌ | 未接。发子回复时却用 `parent_reply_id` 写，**写得出、读不回**；`child_count` 也未使用 |
| 主题写入 | `POST /v1/threads` | ✅ | ⚠️ | 无草稿（`status` 未用）、无 `content_json`、无 `content_language`、无 `server_id` / `post_type` |
| 主题编辑/删除 | `PUT`/`DELETE /v1/threads/{id}` | ✅ | ✅ | 已有，且区分作者/版主错误文案 |
| 回复写入 | `POST /v1/threads/{id}/replies` | ✅ | ⚠️ | 只有 Markdown（服务端已接受 `content_json` + `content_schema_version`） |
| 回复编辑/删除 | `PUT`/`DELETE /v1/threads/{threadId}/replies/{replyId}` | ✅ | ✅ | `replyId` 用 `Long`，与 OpenAPI 一致 |
| 点赞/收藏 | `PUT`/`DELETE /v1/threads/{id}/like|bookmark` | ✅ | ✅ | 以目标状态为准，天然幂等 |
| 图片上传 | `POST /v1/uploads/images` | ✅ | ✅ | 2 MiB 上限、MIME 与扩展名校验在客户端复刻了一份（服务端才是权威） |
| 附件 | `POST /attachments/upload`（历史内部路由，`JwtAuthGuard`） | 🚫 | ⚠️ | `ThreadDetailRepository` / `ThreadDetailScreen` 有 `PendingAttachment` 概念，走的是未包含在任何 V1 契约里的历史路由。它目前能吃论坛会话与 MindAuth token（**不含**移动会话：`/api/v1/native/auth/*` 签发的 access token 是 JWT，被识别为 `forum_mobile_legacy` 身份，但该路由与移动 OAuth 客户端注册的 scope 集合（见阻塞项 1）没有交集） |
| 富文本 | Schema v2（`content_format` / `content_json` / `content_schema_version`） | ✅ | ❌ | 全客户端零处引用；发布与渲染都是 Markdown 单轨 |
| 分类 / 标签 | `GET /v1/categories`、`GET /v1/tags` | ❌ | ⚠️ | App 调得到，但两者**不在**公开白名单里（`public-v1-operation-allowlist.ts`），内部 OpenAPI 里也是空路径项。第三方等价物是 `capabilities.site` 中的分类/标签数据或资源 `topics` |
| 搜索 | `GET /v1/search/posts`、`GET /v1/search` | ✅ | ⚠️ | 只接 `/search/posts`；`/v1/search` 的 `resource_kind` / `content_language` / 分组能力未接 |
| 个人资料 | `GET /v1/me`、`PUT /v1/me/profile`、`POST /v1/me/avatar` | ✅ | ✅ | 头像上传带审核提示 |
| 我的内容 | `M0` 规划了 `GET /v1/me/posts`；当前内部与公开契约都没有 | — | ❌ | 服务端未实现，M0 文档该行已过期。可用 `GET /v1/threads?user_id=` 变通 |
| 收藏列表 | `GET /v1/me/bookmarks` | ✅ | ✅ | 未接 cursor（该接口当前是 page 分页） |
| 举报 | `POST /v1/reports`、`GET /v1/reports/mine` | ✅ | ✅ | — |
| 反馈 | `POST /v1/feedback` | ✅ | ✅ | — |
| 公告 | `GET /v1/notices`、`/v1/notices/{id}` | ✅ | ✅ | 详情用 `content_markdown` 纯文本渲染，与站点富文本不一致 |
| 通知 | `GET /v1/notifications`、`unread-count`、`read`、`read-all` | ✅ | ✅ | page 分页 + 加载更多，能标读 |
| 通知实时 | `POST /v1/realtime/tickets` + WebSocket `/realtime/v1`（SSE `notifications/events` 是历史 `/api` 路由） | ✅ | ❌ | `client/config.notifications_sse` 恒为 `false`；客户端只能手动刷新 |
| 私信 | `GET/POST /v1/messages`、`/v1/messages/unread-count`、`/v1/messages/{userId}` | ✅ | ❌ | 站点产品文档把私信列为现有功能，App 无入口 |
| 好友 | `GET /v1/friends`、`/v1/friends/requests` 等 | ✅ | ❌ | 未接 |
| 在线状态 | `GET /v1/social/friends/presence`、`POST /v1/presence/connections` | ✅ | ❌ | 未接 |
| 屏蔽 / 隐私 | `POST/DELETE /v1/users/{id}/block`、`GET /v1/blocks`、`GET/PATCH /v1/social/privacy` | ✅ | ❌ | 未接。产品文档把屏蔽列为现有功能 |
| 多人联机 | `/v1/multiplayer/*`（会话、邀请、候选、中继） | ✅ | ❌ | 未接。App 只有 LanLink 房间列表 |
| LanLink 房间 | `GET /v1/lanlink/rooms` | 🚫 | ⚠️ | **客户端可用、第三方不可用**：该控制器没有任何鉴权装饰器且匿名可用，但它从未进入公开白名单，第三方拿不到公开文档。要么进白名单，要么改成服务端能力开关驱动 |
| 云存档 | `/v1/game-saves/*` | ✅ | ❌ | 未接（断点续传、配额、冲突、快照都在服务端就绪） |
| 游戏内容 | `/v1/game-content/*`（蓝图代码、地图下载与预览、feed、tags、收藏） | ✅ | ❌ | 未接。资源详情页只能看标题/摘要/下载数 |
| 资源发现 | `/v1/resources/discovery/{home,hot,for-you,related}` | ✅ | ❌ | 未接。算法版本、评分、原因字段都没有落点 |
| 资源类型化读取 | `/v1/resources/mods|maps|schematics/{id}/*` | ✅ | ❌ | 未接（manifest、依赖、分析、版本、关系） |
| 资源编辑器 | `/v1/resources/{id}/versions/{versionId}/editor-data`、`map-editor/region` | ✅ | ❌ | 站点已有 2.7.11 玩家编辑器；App 侧完全没有承载面 |
| 计数与分页语义 | 资源 `published_at` 与 `updated_at` 语义分离（API 1.4.1） | ✅ | ❌ | App 列表按 `createdAt` 排序、展示 `updatedAt`，没有 `published_at` 概念 |
| API 基址 | — | — | ⚠️ | `MdtBbsApi` / 认证 API 共用一个 Retrofit 实例（`core/network/di/NetworkModule.kt`），但 MindAuth 与论坛是不同来源；发布前要确认基址分组、站点 profile（`mdtbbs` / `mindindustry-club`）与证书策略 |

## 三、必须先清的阻塞项

1. **登录链路有三套，且客户端注册的 scope 覆盖不到多人联机与社交能力**。
   客户端当前同时挂着三套登录：MindAuth OAuth（`mdtbbs_android_public`）、论坛自建 `/api/v1/native/auth/*` 事务（`mdtbbs_android`，密码/短信/QQ）、以及论坛 `/api/token` 公开 OAuth。`M0-mobile-auth-rfc.md` 明确要求「必须使用已验证的 HTTPS App Link，不可使用裸自定义 scheme」，而实现里的 redirect 是 `mdtbbs://oauth/callback`：自定义 scheme 在 Android 上可被任意应用抢注。

   授权路径必须先收敛成一套，并且要跟 MindAuth 那边注册的公开客户端对齐。客户端默认申请的 scope 是
   `openid profile email forum.read forum.write resource.read resource.download resource.upload notification.read message.read message.write`，
   其中**没有** `friends.read`、`presence.read`、`presence.write`、`multiplayer.read`、`multiplayer.write`、`game_content.saves.*`。
   这意味着即使客户端接上了好友、在线状态、多人联机、云存档和 `POST /v1/realtime/tickets`，MindAuth 侧也会以 `INSUFFICIENT_SCOPE` 拒绝；这些 scope 需要在客户端注册时一次补齐。

   另外注意身份来源的差别：`/api/v1/native/auth/*` 签发的 access token 是 JWT，会被识别为 `forum_mobile_legacy` 身份并带上 `LEGACY_FIRST_PARTY_SCOPES`；而 MindAuth 的 opaque Bearer 只有在 `authContext.source === 'mindauth_oauth'` 时才受 `OAuthScopeGuard` 约束。选错路径会得到完全不同的权限行为，这一点不能靠试。

2. **正文格式单向兼容（会丢数据）**。
   站点新写入的规范正文是 `tiptap_json`（Schema v2）。客户端只发 Markdown、只读 Markdown 投影，意味着：
   - 富文本内容在 App 里退化显示（表格、任务列表、剧透、公式、可交互组件）；
   - 用 App 编辑一篇富文本帖子再保存，会把规范正文覆盖回 Markdown 投影。

3. **两条未公开路由被当成稳定契约**。
   `POST /api/attachments/upload`（不在任何 V1 契约中）与 `GET /v1/lanlink/rooms`（在内部契约、不在公开白名单）。白名单调整或路由收敛会直接打断 App，第三方客户端也无法复用这部分能力。

4. **没有发布闭环**。
   有 CI 编译门禁（GitHub `android` job），但 `android/app/build.gradle.kts` 只有 debug；没有 release 变体、签名、R8 规则、版本号注入，也没有任何 workflow 产出 APK 制品。**当前没人能拿到一个可安装、可分发的包**，也没人验证 release 构建是否通过。

## 四、按优先级排序的改造建议

排序依据：先消除「会丢数据／会坏」的风险，再补「用户一眼能看出缺失」的能力，最后才是工程完备性。每一步的验收标准、涉及文件与前置依赖见 [`ANDROID-DEVELOPMENT-PLAN.md`](./ANDROID-DEVELOPMENT-PLAN.md)。

### 阶段 0 — 发布闭环（不修就不该发版）

1. 加 release / internal 变体、签名（密钥走 CI secret）、R8 规则、版本号由 CI 注入。
2. CI 产出可下载 APK 制品；CNB `.cnb.yml` 补一条 Android 流水线，与 GitHub 侧对齐。
3. 清理 `android/gradle.properties` 中已无必要的 `android.enableJetifier=true`，并给依赖加上版本更新检查。

### 阶段 1 — 会丢数据的两个风险

4. 写入端发送 `content_json` + `content_schema_version: 2`，读取端按 `content_json` 渲染；Markdown 仅保留兼容输入。渲染方案与 Web 同源（`frontend/src/lib/tiptap` 的序列化约定），不是各写一套。
5. 授权与客户端注册收口：确认上线走哪一套登录，把 redirect 改到已验证的 HTTPS App Link，并在 MindAuth 补齐多人联机/在线状态/好友/实时所需 scope。

### 阶段 2 — 用户可感知的能力缺口

6. 接入 `GET /v1/capabilities` 与完整的 `client/config.features`，所有入口按能力显示/隐藏，未声明即隐藏（fail-closed）。
7. 首页改用 `GET /v1/home`，按 section `state`（`ready`/`stale`/`unavailable`）分别渲染；补 `discover`。
8. 回复分页与子回复：接 `GET /v1/threads/{id}/replies` 与 `.../children`，不再依赖详情内嵌 `replies`。
9. 草稿（`status: draft`）+ 本地草稿恢复。
10. 私信、好友/关注、屏蔽、在线状态——站点已公开为现有功能，App 是唯一缺口面。
11. 资源中心：列表按 `resource_kind` 分类、类型化详情、版本列表、文件下载（跟随 302）、`published_at` 展示；资源发现榜单作为独立入口。
12. 多人联机与云存档：按 `/v1/multiplayer/*`、`/v1/game-saves/*` 接一版最小可用面。

### 阶段 3 — 工程完备性

13. 底部导航从「首页/分类/搜索/我的」调整为与站点一致的五个空间（首页、社区、资源、联机、我的），搜索放回顶栏。
14. 通知改实时：评估公开面 WebSocket `/realtime/v1` + `POST /v1/realtime/tickets`，而不是等一个恒为 `false` 的 SSE 开关。
15. MockWebServer 契约测试（信封、cursor、401 刷新、错误码、断线重连）+ Compose UI 测试 + 真机报告，补齐自己定的质量门槛。
16. 依赖版本对齐（Compose BOM / Room / Retrofit / Hilt 停更约 8 个月）。

## 五、需要一起修正的文档

- `docs/android/M0-android-api-gap.md` 的「已有能力与缺口」表把分类/标签、举报、通知、图片上传、Mobile Auth、threads 读写、bookmarks 记为「新增 V1」，实际均已落地；同表的 `GET /api/v1/me/posts` 至今不存在。已加阅读提示。
- `docs/android/M0-android-engineering-architecture.md` 的底部导航约定（首页、分类、发布、通知、我的）与站点 2.7.5–2.7.6 之后的移动端五项布局不一致；其「Markdown 第一期为源文本输入 + 预览」的约定也需要在富文本改造时一并更新。
- `docs/api/API_ENDPOINTS.json` / `docs/api/API_REFERENCE.md` 生成于 2026-08-30，已显著落后：`/api/v1` 只收 21 条，`/v1/categories`、`/v1/tags` 是空路径项，`/v1/home`、`/v1/discover`、`/v1/messages`、`/v1/friends`、`/v1/presence/*`、`/v1/multiplayer/*`、`/v1/game-saves/*` 全缺。该快照不是当前契约证据，客户端不应据此判断能力有无。
- `docs/product/overview.md` 第 5 行写的「当前 OpenAPI 契约版本为 `1.3.0`」已经过期（`src/openapi/api-version.ts` 为 `1.4.0`，changelog 已发到 1.4.1）；`docs/api/changelog-v1.md` 与 `docs/api/lifecycle-v1.md` 里同样有 `1.2.0` 的残留说法。
- `docs/product/overview.md` 与 `changelog.md` 已把私信、云存档、多人联机、玩家编辑器列为现有能力；Android 是唯一完全没有覆盖面的官方客户端，对外描述前需要说明这一边界。

## 六、上一版审计的更正

上一版审计同日发布，其中以下判断有误，本版已修正，保留记录以便对照：

| 上一版说法 | 实际情况 |
| --- | --- |
| 「`.cnb.yml` 与 `.github/workflows/ci.yml` 都只构建后端和前端；Android 没有编译门禁」 | `.github/workflows/ci.yml` 内有 `android` job，跑 `testDebugUnitTest :app:assembleDebug`。缺的是 release 变体与制品产出，不是编译门禁 |
| 「客户端在依赖两条未公开路由」 | 只有 `attachments/upload` 与 `lanlink/rooms` 两条；其余 App 在用接口（threads、categories、tags、notices、resources、lanlink 之外的部分）中，唯一不在公开白名单的是 `/v1/categories` 与 `/v1/tags` |
| 「`content_format` / `content_json` / `content_schema_version` 全客户端零引用」 | 成立，但要对齐的是**详情与回复**。写接口服务端已接受 `content_json`，客户端没发 |
| 「只有 5 个单元测试」 | 是 5 个测试类、21 个用例 |
| 「`/v1/capabilities` 一次都没调用」 | 成立；同时 `client/config` 只读 `features.posting` |
| 「授权要求 HTTPS App Link」 | 成立，且三套登录并存；本轮进一步给出 scope 缺口的具体清单 |

## 相关文档

- [Android 客户端开发计划](./ANDROID-DEVELOPMENT-PLAN.md)
- [M0 API 缺口清单](./M0-android-api-gap.md)
- [M0 工程目录与实现约定](./M0-android-engineering-architecture.md)
- [Mobile Auth RFC](./M0-mobile-auth-rfc.md)
- [第三方客户端接入指南](../api/public-client-v1.md)
- [论坛 API V1 参考](../api/first-party-v1.md)
