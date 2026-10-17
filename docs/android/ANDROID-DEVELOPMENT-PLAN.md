# Android 客户端开发计划

**制定日期：** 2026-10-09；**基线：** 论坛 2.7.12、Public V1 白名单 231 条操作、`docs/android/ANDROID-CLIENT-STATUS.md` 的逐功能审计。

本文件是**计划**，不是现状描述。现状与依据一律看 [`ANDROID-CLIENT-STATUS.md`](./ANDROID-CLIENT-STATUS.md)。每条都有可判定的完成条件；完成一个阶段再进入下一个，阶段内不并行开多条改造线。

## 阶段总览

| 阶段 | 目标 | 出口条件 | 前置 |
| --- | --- | --- | --- |
| 0 | 发布闭环 | CI 能产出带签名的 release APK 制品 | 无 |
| 1 | 消除数据与授权风险 | App 不再写坏富文本；授权路径唯一且有注册依据 | 阶段 0 完成；MindAuth 客户端注册需外部对齐（可并行准备） |
| 2 | 能力缺口补齐 | 首页、回复分页、私信、资源中心可用 | 阶段 1 完成 |
| 3 | 工程完备性 | 质量门槛达标，可对外发版 | 阶段 2 完成 |

阶段 0、1 是发版阻塞项，未完成不得发布任何面向外部的安装包。

## 阶段 0 — 发布闭环

当前状态：只有 debug 变体；GitHub Actions 有 `android` job 跑 `:app:testDebugUnitTest :app:assembleDebug`，但没有任何 workflow 产出制品。

任务：

1. `android/app/build.gradle.kts` 增加 `internal` / `release` 变体，`release` 打开 `isMinifyEnabled` + R8 规则，关闭 debug 签名回退。
2. 版本号（`versionCode` / `versionName`）改为由 CI 注入的 Gradle property，本地默认保留当前值；`applicationIdSuffix` 只用于 internal。
3. 签名走 CI secret（`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`），密钥不入库。
4. GitHub `android` job 增加 `:app:assembleRelease` 并把 APK 作为 artifact 上传；若仓库的构建基线是 CNB，则同时在 `.cnb.yml` 补一条同等语义的 Android 流水线，避免两侧判定标准漂移。
5. 清理 `android/gradle.properties` 的 `android.enableJetifier=true`（当前依赖集不需要）。
6. 给 `mdtbbs*` 那一批 Gradle property 补部署文档：目前 `mdtbbsApiBaseUrl` / `mdtbbsMindAuthBaseUrl` / `mdtbbsOauthClientId` / `mdtbbsNativeAuthBaseUrl` / `mdtbbsNativeAuthClientId` / `mdtbbsOauthScopes` 在生产没有任何说明，配错就是连不上。

出口条件：

- 从 CI 下载到 APK，安装到真机可启动并完成一次匿名浏览。
- `:app:assembleRelease` 在 CI 绿。
- 上述 property 在 `docs/android/` 或部署文档里有明确取值来源。

## 阶段 1 — 消除数据与授权风险

### 1A 富文本双向兼容（会丢数据，优先）

- 写入：`CreateThreadRequest` / `CreateReplyRequest` 增加 `content_json` + `content_schema_version: 2`；编辑器产出与 Web 编辑器同源的文档结构。
- 读取：详情与回复优先按 `content_json` 渲染（Schema v2）；`content_html` / `content` 只作降级路径。
- 渲染实现复用 `frontend/src/lib/tiptap` 已固化的序列化与呈现约定，不在 Android 侧另写一套 Markdown 解析器。
- 回归：至少覆盖表格、任务列表、剧透、代码块、图片、提及、公式六类节点；编辑一篇 Web 端富文本帖子后保存，`content_json` 不得退化为 Markdown 投影。

### 1B 授权路径收口

- 三套登录收敛为一套上线路径，删除或明确隔离其余路径（`/api/v1/native/auth/*` 客户端注册、`/api/token`）。
- redirect 改到已验证的 HTTPS App Link；`mdtbbs://oauth/callback` 从 manifest 移除。
- `client_id` 收敛为一个。
- 在 MindAuth 侧补齐启动就绪所需的全部 scope（见审计文档阻塞项 1 的清单）。
- 决策未定之前，阶段 1A 可以推进；**1B 的客户端改动不要先写**，否则会把错误方案固化进 diff。

出口条件：

- 全仓找不到两套并存的移动端登录实现。
- 冷启动登录 → 令牌刷新 → 退出登录在真机全通，且 401 只触发一次单飞刷新。
- `/v1/realtime/tickets` 与一个联机只读接口能通过 scope 校验（若阶段 2 尚未接入，用接口直连验证）。

## 阶段 2 — 能力缺口补齐

按依赖顺序，不要打乱：

1. **能力发现先行**：接入 `GET /v1/capabilities` 与完整的 `client/config.features`，所有入口按能力显示/隐藏，未声明即隐藏（fail-closed）。这一步做完，后面每一项都可以独立开关。
2. **首页与发现**：首页改用 `GET /v1/home`，按 section `state`（`ready`/`stale`/`unavailable`）分级渲染；补 `GET /v1/discover`。
3. **回复模型纠偏**：接 `GET /v1/threads/{id}/replies`（page 分页）与 `.../replies/{replyId}/children`，用 `child_count` 控制展开；不再依赖详情内嵌 `replies` 的第一页。
4. **草稿**：写入端传 `status: draft`，配合本地草稿恢复；发布超时不清草稿。
5. **社交面**：私信（`/v1/messages/*`）、好友与关注、屏蔽与隐私、在线状态按站点产品口径补齐。
6. **资源中心**：列表按 `resource_kind` 分类、类型化详情（`/v1/resources/mods|maps|schematics/{id}/...`）、版本列表、文件下载跟随 302、列表展示 `published_at`；资源发现榜单作为独立入口。
7. **联机与云存档**：按 `/v1/multiplayer/*`、`/v1/game-saves/*` 接一版最小可用面（会话 + 邀请 + 存档槽位/上传/冲突提示）。
8. **文案与内容**：公告详情、通知内容、反馈与举报的错误提示统一走站点文案体系，不再各自硬编码。

出口条件：每接入一项，`ANDROID-CLIENT-STATUS.md` 对照表中对应行的状态同步更新；翻页、子回复、能力关闭三种场景都有手工验收记录。

## 阶段 3 — 工程完备性

- 底部导航改为与站点一致的五个空间（首页、社区、资源、联机、我的），搜索回到顶栏。
- 通知改实时：评估 WebSocket `/realtime/v1` + `POST /v1/realtime/tickets`（ticket 60 秒有效），而不是等恒为 `false` 的 SSE 开关；断线重连要有退避上限。
- 测试补到 `M0-android-engineering-architecture.md` 自己写的门槛：MockWebServer 覆盖信封/cursor/401 刷新/错误码/断线，Compose UI 覆盖底部导航、帖子卡点击、发布与回复校验、登录失效和空状态；至少一台 Android 10+ 低端机与一台当前版本设备的真机报告。
- 依赖版本对齐与更新检查（Compose BOM / Room / Retrofit / Hilt 停更约 8 个月）。

出口条件：质量门槛四类测试都有 CI 覆盖，真机报告记录在 `docs/android/` 下。

## 文档同步义务

改客户端能力时同步这几处，否则下一个人又会读过期信息：

- `docs/android/ANDROID-CLIENT-STATUS.md` 对照表对应行。
- `docs/android/M0-android-api-gap.md` 仅在「一期契约目标」层面更新；现状不要写进去。
- `docs/product/changelog.md` 仅在能力对外可用后追加；未发布的不写。
- 涉及 Public V1 契约本身的变化（例如把 `/v1/categories`、`/v1/lanlink/rooms` 提升为公开操作），必须先走 `docs/api/changelog-v1.md` 与白名单评审，不要在客户端里硬依赖。

## 相关文档

- [Android 客户端现状审计](./ANDROID-CLIENT-STATUS.md)
- [M0 API 缺口清单](./M0-android-api-gap.md)
- [M0 工程目录与实现约定](./M0-android-engineering-architecture.md)
- [Mobile Auth RFC](./M0-mobile-auth-rfc.md)
