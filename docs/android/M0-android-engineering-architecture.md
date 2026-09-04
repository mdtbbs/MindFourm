# Android M0：工程目录与实现约定

**状态：** Accepted；**技术基线：** Kotlin、Jetpack Compose、Material 3、ViewModel + StateFlow、Retrofit/OkHttp、Room、DataStore、Paging 3、Hilt、Coil。

## 工程边界

一期使用单一 Gradle `app` module，按 package 分层；不预先拆分大量 Gradle module。只有编译时间、独立发布或依赖隔离出现明确需求时，才将稳定边界拆为 `core:*` 或 `feature:*`。

```text
app/src/main/java/cn/mdtbbs/android/
  core/
    common/          # Result、错误映射、Dispatcher、时间和日志
    model/           # 领域模型；不直接暴露网络 DTO
    network/         # Retrofit、V1 DTO、OkHttp、认证刷新、SSE
    database/        # Room entity、DAO、迁移、RemoteMediator
    datastore/       # 偏好、草稿索引、非敏感设置
    designsystem/    # MDTBBS 蓝色主题、组件、图标、排版
    auth/            # PKCE、Keystore token store、会话状态
  feature/
    home/
    category/
    search/
    post/
    editor/
    notification/
    profile/
    settings/
  navigation/        # 类型安全路由、深链、底部导航
  sync/              # 前台 SSE、WorkManager 刷新入口
  MainApplication.kt
  MainActivity.kt
```

底部导航固定为：首页、分类、发布、通知、我的。资源、私信、好友、关注不建立一期入口或假功能。

## 数据与状态规则

- 网络 DTO 只在 `core.network`；Repository 将其转换为领域模型，UI 不读取 DTO。
- Server 是互动状态、未读数、权限和审核状态的唯一权威来源。
- Room 只缓存帖子摘要、最近详情、分类、基础用户资料、阅读历史和草稿；不把点赞、未读、权限、在线状态长期当权威数据。
- 使用 `PagingSource + RemoteMediator + Room + PagingData + LazyColumn` 消费帖子流。流分页使用服务端 opaque cursor；搜索使用 API 明确支持的页码分页。
- 草稿本地优先保存，发布成功后删除；图片上传或发布失败保留草稿和可恢复错误信息。
- 所有时间使用 ISO-8601 UTC 传输，展示层本地化。数据库兼容 ID 使用 `Long`；V1 `public_id`、`session_id` 与 cursor 使用 `String`。notification、resource、thread 等其他标识严格按 OpenAPI 字段类型建模，不在客户端强制统一为 `Long`。

## 网络、认证与错误处理

OkHttp 拦截器为普通 V1 请求补 Bearer access token；刷新器只在 401 时单飞刷新一次。登录、刷新、登出和 SSE 的细则以 `M0-mobile-auth-rfc.md` 为准。

统一把 V1 `error.code` 映射为可测试的领域错误：`UNAUTHENTICATED`、`SESSION_REVOKED`、`PHONE_NOT_VERIFIED`、`FORBIDDEN`、`VALIDATION_FAILED`、`RATE_LIMITED`、`NETWORK`。`PUT`/`DELETE` 的 like 与 bookmark 以目标状态为准，重复执行必须天然幂等。创建主题、回复、举报和图片上传等 `POST` 请求在 V1 实现后使用 `Idempotency-Key`；非幂等请求不能因网络超时无条件重发。

## UI 约定

- Material 3 为交互与可访问性基础，主题采用 MDTBBS 蓝色并点缀少量 Mindustry 像素视觉；不以装饰牺牲对比度、字体缩放或触控目标。
- 整张帖子卡片可点击进入详情；点赞、评论、收藏有独立语义化点击区域。
- Markdown 第一期为源文本输入 + 编辑/预览切换；工具栏只提供粗体、斜体、链接、图片、引用、代码。
- 列表、详情、编辑器、通知和个人页均实现 loading、empty、offline 和 retry 状态；深色模式和 `fontScale` 至少在 Beta 前真机验证。

## 开发里程碑

| 里程碑 | Android 可见结果 | 后端依赖 |
| --- | --- | --- |
| M0 | 工程骨架、Mock API、登录协议与契约测试样例 | API Contract、Mobile Auth RFC |
| M1 | 首页、分类、详情的可浏览 APK | V1 threads read、categories、search、client config |
| M2 | 登录、我的、点赞与收藏 | Mobile Auth、me、interaction V1 |
| M3 | 回复、嵌套回复、举报 | replies、reports V1 |
| M4 | 发主题、草稿、图片、Markdown 预览 | threads write、image upload V1 |
| M5 | 通知页、未读数、前台 SSE | notifications V1 + SSE |
| M6 | Paging/Room、弱网与恢复 | Cursor 契约稳定 |
| M7 | 内测 APK、自动化与真机报告 | 稳定测试环境 |

## 质量门槛

- Unit：ViewModel、Repository、错误映射、token refresh、草稿恢复。
- 网络：MockWebServer 覆盖信封解析、cursor、401 刷新、错误码和 SSE 断线。
- UI：Compose 覆盖底部导航、帖子卡点击、发布/回复校验、登录失效与关键空状态。
- 真机：至少一台 Android 10+ 低端机与一台当前 Android 版本设备；验证冷启动、旋转/进后台恢复、弱网、深色模式、字体放大和通知连接。
- 发布：debug/internal/beta 三个变体；签名密钥不进入仓库，版本号由 CI 注入，崩溃监控与隐私政策在 Beta 前配置。
