# Android 客户端配置与构建参数

本文档记录 MindFourm 移动端服务端配置接口（`GET /api/v1/client/config`）以及 `android/` 模块的 Gradle 构建参数，取值以当前代码为准。客户端功能覆盖范围与改造计划见 [`ANDROID-CLIENT-STATUS.md`](ANDROID-CLIENT-STATUS.md) 与 [`ANDROID-DEVELOPMENT-PLAN.md`](ANDROID-DEVELOPMENT-PLAN.md)。

## 服务端客户端配置接口

- **接口路径**：`GET /api/v1/client/config`
- **控制器**：`src/modules/capabilities/client-config-v1.controller.ts`
- **服务实现**：`src/modules/capabilities/capabilities.service.ts`（`getAndroidClientConfig`）
- **OpenAPI 归属**：已列入 Public V1 白名单（`src/openapi/public-v1-operation-allowlist.ts`）

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `platform` | `string` | 否 | 客户端平台标识，传 `android` 时返回 `android`，其余值返回 `unknown` |
| `version_code` | `number` | 否 | 当前已安装客户端 `versionCode`（示例：`100`） |

### 响应字段与后台开关映射

接口返回结构为 `{ data, meta }`，其中 `data` 字段如下：

| 响应字段 | 类型 | 默认值 | 对应后台 `settings` 键 | 说明 |
| --- | --- | --- | --- | --- |
| `platform` | `string` | `unknown` | — | `android` 或 `unknown` |
| `minimum_version_code` | `number` | `100` | `android_minimum_version_code` | 允许运行的最低版本号 |
| `latest_version_code` | `number` | 同 `minimum_version_code` | `android_latest_version_code` | 最新版本号 |
| `force_update` | `boolean` | `false` | `android_force_update` | 是否开启强制更新提示 |
| `maintenance` | `boolean` | `false` | `android_maintenance` | 是否处于客户端维护模式 |
| `features.posting` | `boolean` | `true` | `feature_public_api_forum_write_enabled` | 是否允许公开 API 发帖/写入 |
| `features.image_upload` | `boolean` | `true` | `feature_public_api_image_upload_enabled` | 是否允许公开 API 图片上传 |
| `features.notifications_sse` | `boolean` | `false` | — | 当前固定返回 `false` |

## Android Gradle 构建参数

以下参数在 `android/app/build.gradle.kts` 中通过 `providers.gradleProperty(...)` 读取，可在 `gradle.properties` 或命令行 `-P<key>=<value>` 覆盖：

| Gradle Property | 生成的 `BuildConfig` 字段 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `mdtbbsApiBaseUrl` | `API_BASE_URL` | `https://mdtbbs.cn/` | 论坛后端基础地址 |
| `mdtbbsMindAuthBaseUrl` | `OAUTH_API_BASE_URL` | `https://auth.mdtbbs.cn/` | MindAuth 服务基础地址（自动补齐末尾 `/`） |
| `mdtbbsOauthAuthorizationEndpoint` | `OAUTH_AUTHORIZATION_ENDPOINT` | `${OAUTH_API_BASE_URL}api/authorize` | OAuth 授权端点 |
| `mdtbbsOauthClientId` | `OAUTH_CLIENT_ID` | `mdtbbs_android_public` | 公开客户端 OAuth Client ID |
| `mdtbbsOauthScopes` | `OAUTH_SCOPES` | `openid profile email forum.read forum.write resource.read resource.download resource.upload notification.read message.read message.write` | 请求的 OAuth Scope 列表 |
| `mdtbbsMindAuthRegistrationUrl` | `MINDAUTH_REGISTRATION_URL` | `${OAUTH_API_BASE_URL}register` | MindAuth 注册页地址 |
| `mdtbbsNativeAuthBaseUrl` | `NATIVE_AUTH_BASE_URL` | 同 `OAUTH_API_BASE_URL` | 原生登录基础地址 |
| `mdtbbsNativeAuthClientId` | `NATIVE_AUTH_CLIENT_ID` | `mdtbbs_android` | 原生登录 Client ID |

### 固定回调与应用标识

- `applicationId`：`cn.mdtbbs.android`（`minSdk = 26`，`targetSdk = 35`，`compileSdk = 35`）
- `OAUTH_REDIRECT_URI`：当前固定为 `mdtbbs://oauth/callback`（通过 `manifestPlaceholders` 注入 `mdtbbsOauthScheme=mdtbbs`、`mdtbbsOauthHost=oauth`、`mdtbbsOauthPath=/callback`），需在 MindAuth 中注册并批准。向 HTTPS App Link 收敛的计划见 [`ANDROID-DEVELOPMENT-PLAN.md`](ANDROID-DEVELOPMENT-PLAN.md)。
