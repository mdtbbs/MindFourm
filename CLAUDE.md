# CLAUDE.md

本文件是 MindFourm 仓库中 AI Coding Agent 的根级工程上下文。

它用于约束 Claude Code、Codex 和其他自动化开发 Agent 在本仓库中的架构判断、修改边界、兼容策略、验证方式与交付标准。

`CLAUDE.md` 不是项目百科，也不负责复制所有模块、Entity、API、环境变量或功能列表。容易变化的信息应从对应事实源读取。

---

# 1. 核心原则

MindFourm 是 MDTBBS / Mindustry Club 共用的社区后端与客户端仓库，整体方向为：

- Foundation-first
- Modular Monolith
- API First
- 渐进式演进，而非大规模重写
- 公共能力优先沉淀到稳定 `/api/v1/*`
- Web、Android、桌面客户端、Mindustry Mod、第三方启动器共享同一公共能力模型
- MDTBBS 与 Mindustry Club 共用代码主干，通过 Site Profile 表达真实差异
- 数据库 Schema 只允许通过显式 TypeORM Migration 演进
- 已发布公共契约、资源版本和用户数据优先保持兼容

进行任何修改时，优先保持已有稳定边界，再扩展能力。

不要为了完成单个需求复制一整套平行实现。

不要把计划中的架构描述成已经实现。

不要因为某段旧文档写着某个框架版本、模块数量、Entity 数量或接口数量，就把它当作事实。

---

# 2. 事实源优先级

当代码、README、历史文档、注释或本文件发生冲突时，按下面的原则判断。

## 2.1 一般工程事实

优先级：

1. 可执行代码与测试
2. Database Migration / Entity 注册
3. 公共 OpenAPI 契约
4. 专项架构或协议文档
5. `CLAUDE.md`
6. `README.md` 和其他说明性文档
7. 代码注释、历史说明、Issue 或旧设计记录

但公共 API 是特殊情况。

如果 `/api/v1/*` 的运行实现、OpenAPI、公开文档或测试互相冲突，不要简单选择其中一个作为正确答案。

这属于 **contract drift**。

应确认预期行为，并让实现、契约、文档与测试重新一致。

## 2.2 不要在 CLAUDE.md 中维护动态数量

禁止维护类似：

- 当前有多少个 Nest Module
- 当前有多少个 Entity
- 当前有多少个 Migration
- 当前有多少个 API endpoint
- 当前有多少个前端页面
- 当前测试数量

需要这些信息时直接检查事实源。

## 2.3 依赖版本

Node、Next.js、React、NestJS、Tiptap、Android SDK、Kotlin、Gradle 等版本以实际依赖文件为准：

- `package.json`
- `frontend/package.json`
- `android/**/*.gradle.kts`
- Gradle wrapper
- Renderer build files

不要把依赖版本复制进本文件，除非版本本身构成架构兼容边界。

---

# 3. 开始修改前

在开始实现前：

1. 定位真实调用链。
2. 找到该领域的事实源。
3. 检查已有测试。
4. 检查是否存在 `/api/v1` 公共契约。
5. 检查是否涉及 Site Profile。
6. 检查是否涉及数据库 Schema。
7. 检查是否同时被 Web、Android、Mod 或第三方客户端消费。
8. 对资源、上传、认证、权限和联机代码额外检查安全边界。

不要仅根据文件名推断行为。

不要看到旧实现不好看就直接重写整个模块。

优先进行最小、可验证、向后兼容的修改。

---

# 4. Repository Map

主要区域：

```text
src/
  common/                 公共 Guard、Filter、Interceptor、Contract、工具
  config/                 应用与 Site Profile 配置
  database/               TypeORM、Migration、Redis
  entities/               TypeORM Entity
  modules/
    community-core/       社区核心 composition root
    mdtbbs-domain/        MDTBBS 领域 composition root
    resources/            资源中心
    multiplayer/          联机控制面
    ...
  openapi/                公共 V1 OpenAPI 构建与白名单
  developer-docs/         在线开发者文档

frontend/
  src/app/                Next.js App Router
  src/components/
  src/lib/api/            Legacy API transport
  src/lib/api/v1/         Public V1 transport
  src/config/             Frontend Site Profile
  src/i18n/

android/                   第一方 Android 客户端

tools/mindustry-renderer/  Mindustry 地图/蓝图隔离解析与渲染 Worker

docs/
  api/                     公共 API 契约与接入文档
  ...

tests/e2e/                 Playwright 产品 E2E

.github/workflows/         CI 事实源
```

需要了解完整目录时读取仓库，不要依赖此处列表。

---

# 5. Backend Composition

`AppModule` 是根 composition root，但不应该再次演变成几十个业务 Module 的平铺注册表。

核心业务组合通过：

```text
CommunityCoreModule
MdtbbsDomainModule
```

组织。

新增模块或移动功能时，应先确认它属于：

- 通用社区能力
- MDTBBS / Mindustry 领域能力
- 基础设施能力
- Site Profile 差异
- 独立 Worker / 外部服务

不要为了方便继续把所有模块直接塞回 `AppModule`。

跨模块调用优先通过清晰的 Service / Module 边界完成。

避免形成循环依赖。

---

# 6. Backend Runtime Conventions

全局 bootstrap 行为以 `src/main.ts` 为准。

主要运行边界包括：

- 全局 `/api` prefix
- ValidationPipe
- ResponseInterceptor
- AllExceptionsFilter
- CSRF middleware
- request ID
- client context
- Helmet / security headers
- CORS
- OpenAPI
- Developer Docs

修改这些基础设施时要假设它会影响整个站点。

## 6.1 DTO 与 Validation

写 API 时优先使用 `class-validator` DTO。

全局 ValidationPipe 启用了：

```text
whitelist
forbidNonWhitelisted
transform
```

因此未知字段应该被拒绝，而不是被业务层静默接受。

### 可选数字 Query 参数

不要随意写：

```ts
@Query('page', new ParseIntPipe({ optional: true }))
```

本仓库曾出现省略可选参数却被全局 validation 拒绝的问题。

复杂查询参数优先使用 DTO + `class-transformer`。

## 6.2 MySQL DATETIME Cursor

时间游标传给 MySQL DATETIME 比较时，应使用正确的 `Date` 值。

不要假设 ISO 字符串与 DATETIME 比较一定具有预期语义。

已有日期游标工具时优先复用。

## 6.3 LIKE 查询

用户提供的 LIKE 查询必须正确处理：

```text
%
_
\
```

使用已有 `escapeLike()` 等公共工具，不要手写不完整的转义。

---

# 7. Response Contracts

MindFourm 当前存在 Legacy API 和 Public V1 两种响应契约。

必须明确区分。

## 7.1 Legacy `/api/*`

普通 legacy controller 返回业务 payload。

全局 `ResponseInterceptor` 负责包装：

```json
{
  "success": true,
  "data": {}
}
```

因此 legacy handler 不应自行再次返回：

```json
{
  "success": true,
  "data": {}
}
```

否则会产生双层 envelope。

## 7.2 Public `/api/v1/*`

V1 contract 使用：

```json
{
  "data": {},
  "meta": {
    "request_id": "..."
  }
}
```

错误使用：

```json
{
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "用户可读文本",
    "retryable": false,
    "details": []
  },
  "meta": {
    "request_id": "..."
  }
}
```

客户端控制流应依赖：

- HTTP status
- `error.code`

不要依赖：

- 中文错误提示
- 英文错误提示
- 实现内部异常名称

`message` 可以因语言或文案调整而变化。

### MUST

Public V1 使用稳定 machine-readable error code。

### MUST NOT

不要把 Legacy `/api/*` 的 envelope 假设应用到 `/api/v1/*`。

不要在 V1 controller 中手工重复包装已经由 contract interceptor 处理的成功 envelope。

---

# 8. Public API V1

`/api/v1/*` 是第三方客户端与跨客户端能力的稳定边界。

公开范围不等于所有路径里包含 `/v1/` 的 controller。

公开 API 由 OpenAPI 构建逻辑和明确的 operation allowlist 决定。

事实源包括：

```text
src/openapi/
openapi-public-v1.json
openapi-v1.json
docs/api/
```

## 8.1 API First

新增需要被多个客户端使用的能力时，优先考虑放入 `/api/v1/*`。

不要为：

- Android
- PC
- 某个启动器
- Xenon
- Mindustry Mod

分别创造语义重复的私有接口。

客户端特有 UI 不等于需要客户端特有后端 API。

## 8.2 Stable Public IDs

跨客户端对象优先使用稳定 `public_id` 或协议定义的不透明 ID。

如果对象已经存在公开稳定 ID：

**不要新增依赖数据库自增 ID 的公共客户端契约。**

数据库 ID 是实现细节，除非现有公共契约已经明确规定它属于协议。

## 8.3 Compatibility

V1 内通常允许：

- 新增可选字段
- 新增可忽略的响应 metadata
- 新增新的独立 endpoint

客户端必须能够忽略未知可选字段。

以下变化不能静默发生：

- 删除公开字段
- 修改字段身份语义
- 将可选字段变成必填字段
- 改变响应 envelope
- 改变公开 ID 的意义
- 改变 OAuth scope 语义
- 删除 endpoint
- 让原本兼容的请求开始代表不同操作

破坏性变化应遵循公开 API 生命周期规则。

---

# 9. OpenAPI、Developer Docs 与 Changelog

公共 API 代码完成并不代表任务完成。

对于任何外部可观察的 `/api/v1/*` 变化，应检查：

```text
实现
OpenAPI
public operation allowlist
错误代码
OAuth scope
capabilities
人类可读文档
changelog
测试
```

## 9.1 OpenAPI

提交公共 V1 改动前运行：

```bash
npm run openapi:check
```

如果 contract drift 是预期的，应重新生成并提交正确的 contract。

不要为了让 CI 通过而删除 OpenAPI 检查。

## 9.2 Developer Docs

在线开发者文档本身属于产品接口。

主要入口包括：

```text
/developers
/api/v1
/api/v1/reference
/api/v1/debugger
/api/v1/docs/*
```

导航中存在的页面必须能够真实访问。

增加 Markdown guide 时必须同时注册对应 slug。

不要创建指向不存在文档页面的导航。

## 9.3 Changelog

公开 API 更新必须同步：

```text
docs/api/changelog-v1.md
```

推荐分类：

```text
Added
Changed
Deprecated
Removed
Fixed
Security
```

Changelog 应写清：

- method
- path
- scope / capability 变化
- 关键请求或响应变化
- 客户端迁移影响

不要只写“优化资源中心”这种无法用于迁移的描述。

内部接口重构通常不需要写入公开 API changelog。

## 9.4 Deprecation

公开 API 不得静默移除。

弃用规则以：

```text
docs/api/lifecycle-v1.md
```

为事实源。

当前生命周期规则要求：

- OpenAPI `deprecated: true`
- `x-deprecated-since`
- `x-removal-plan`
- `x-migration-guide`
- Changelog
- 迁移指南

并遵守已声明的兼容与保留周期。

---

# 10. Database & Migrations

数据库 Schema 的唯一正常演进方式是 TypeORM Migration。

## MUST

- 新增表必须写 Migration
- 新增列必须写 Migration
- 修改索引必须写 Migration
- 修改唯一约束必须写 Migration
- 数据 backfill 与 schema migration 明确区分
- 新 Entity 注册到显式 Entity 列表
- 新 Migration 注册到显式 Migration 列表
- migration 必须考虑已存在生产数据
- migration 必须可以在真实旧 Schema 上执行

## MUST NOT

**永远不要启用 TypeORM `synchronize`.**

包括：

- development
- test
- staging
- production

都不要。

不要使用 `synchronize` 修复测试。

不要把 `initializeDatabase()` 当成自动建表器。

启动时的 Schema 检查用于确认 migration 产生的结构已经存在。

## 10.1 Registration

Entity 事实源：

```text
src/entities/index.ts
```

Migration 事实源：

```text
src/database/migrations/index.ts
```

新增 Entity 却忘记注册会导致运行时 metadata 问题。

新增 Migration 却忘记注册会导致代码与数据库永久分叉。

## 10.2 Production Safety

除非用户明确要求部署操作：

- 不执行生产 Migration
- 不修改生产数据库
- 不声称 Migration 已在生产执行
- 不声称 PR 已部署

本地测试通过、CI 通过、PR 合并和生产上线是不同状态。

报告结果时明确区分。

---

# 11. Transactions & Concurrency

涉及以下行为时，应主动考虑 transaction、row lock、unique constraint 或原子更新：

- 所有权转让
- 资源 revision 分配
- 积分扣除
- 商店库存
- 邀请接受
- 幂等请求
- 重复上传
- 审核状态迁移
- 好友双向关系
- 下载授权
- 并发创建唯一记录

不要依赖：

```text
先 SELECT
然后 if
然后 INSERT
```

来保证并发正确性。

数据库约束应该承担最终一致性保护。

涉及“检查权限后再修改资源”时，应考虑权限在检查后发生变化的 TOCTOU 问题。

---

# 12. Rich Content V2

帖子、回复、资源说明等新结构化正文使用 Tiptap / ProseMirror JSON。

对于 V2 内容：

```text
content_schema_version = 2
content_json
```

是规范内容表示。

Markdown `content` 继续承担：

- 旧客户端兼容
- 搜索投影
- 通知
- RSS
- 摘要
- 纯文本兼容场景

不要把 Markdown 当成新 Rich Content V2 的唯一事实源。

## 12.1 Schema

允许节点、marks、属性和安全规则以：

```text
docs/api/rich-content-schema-v2.md
```

和对应 validator / extension 实现为准。

Frontend editor schema 和 Backend validator 必须保持一致。

修改 editor extension 时检查 backend contract test。

修改 backend rich-content schema 时检查 frontend editor。

## 12.2 Sanitization

即使 `content_json` 已经过 Schema 校验：

生成 HTML 时仍必须经过安全处理。

不要信任客户端发送的 HTML。

不要允许未知：

- node
- mark
- attr
- URL scheme
- embed source

直接进入渲染结果。

---

# 13. Resource Center

资源中心是社区资源模型与 Mindustry 结构化内容数据库的重要组成部分。

核心逻辑对象包括：

```text
Resource
ResourceVersion
ResourceFile
```

以及按资源类型扩展的数据。

资源类型不能被当成完全相同的附件。

Mod、Map、Schematic 和 Pack 可以共享基础生命周期，但详情、分析、兼容性和交互可以高度定制。

---

# 14. Resource Identity & Immutability

## 14.1 Public Identity

对外使用：

```text
Resource.public_id
ResourceVersion.public_id
ResourceFile.public_id
```

第三方客户端不应持久化服务器磁盘路径。

第三方客户端不应依赖内部自增 ID 来标识这些对象。

## 14.2 Published Version Immutability

**已发布资源版本是不可变快照。**

同一业务版本字符串允许通过 `revision` 产生后续修订。

修复或替换文件时：

创建新的 revision / version。

不要原地覆盖以前已发布的 binary，然后继续使用旧版本身份。

这条规则对：

- 客户端缓存
- SHA-256
- 下载
- 审核
- 版本差异
- 更新判断
- 未来 CAS/blob 复用

都非常重要。

---

# 15. Resource Membership & Authorization

资源不仅属于 `resources.user_id`。

当前协作角色包括：

```text
owner
maintainer
publisher
```

进行资源写操作时使用既有领域授权逻辑。

不要把：

```ts
resource.user_id === actor.id
```

作为所有资源操作的完整权限模型。

Owner、Maintainer、Publisher 的权限不同。

高风险操作例如：

- 所有权转让
- 成员管理
- 关键资料修改
- 审核
- 删除
- 发布

必须使用对应领域规则。

管理员权限也必须显式处理，而不是通过偶然绕过 owner check 获得。

---

# 16. Resource Moderation

Resource 与 ResourceVersion 具有审核生命周期。

新上传的 binary 不应因为 Resource 以前已经通过审核就自动继承所有信任。

以下操作可能需要重新进入审核：

- 新文件
- 新 revision
- 来源声明变化
- License 变化
- Mod ID 变化
- 安全分析发现
- 其他被策略认定为关键的 metadata 变化

不要为了减少审核步骤绕过现有 review service。

审核事件应保留可审计记录。

---

# 17. Resource File Storage

资源文件的逻辑身份与物理存储位置分离。

`ResourceFile` 可以描述：

- managed storage
- MFL/provider storage
- external delivery

不要假设所有文件都在本地磁盘。

不要把 `storage_key` 或 `file_path` 暴露成公共身份。

## 17.1 Quarantine

新上传文件在正式审核/批准前进入私有隔离区。

Quarantine 文件：

- 不应通过公开静态目录暴露
- 不应被匿名下载
- 不应通过路径猜测访问
- 读取必须验证 managed root
- 删除必须限制在受控存储根目录

公开文件和 quarantine 文件不能混用访问规则。

## 17.2 Hash

当前系统已使用 SHA-256 `content_hash` 作为：

- 完整性信息
- 重复内容判断基础
- 资源版本文件元数据
- 分析/预览等能力的一部分

但当前仓库**尚未保证所有物理存储使用内容寻址 Blob/CAS**。

因此：

- 可以依赖 `content_hash` 的完整性语义
- 不要假设 hash 相同一定物理只存一份
- 不要假设 `storage_key == hash`
- 不要提前编造 Blob Entity 或引用计数语义

未来真正落地 CAS 时再升级这一架构规则。

---

# 18. Resource Analysis

用户上传内容属于不可信输入。

## 18.1 Mod

静态分析 Mod 时：

**不要执行上传 Mod 的代码。**

JAR/ZIP 解析必须：

- 有大小限制
- 有文件类型限制
- 防 Zip Bomb / 异常 archive
- 防路径穿越
- 对 manifest 和 metadata 做 validation

分析失败不能导致任意服务端代码执行。

## 18.2 Map / Schematic

地图和蓝图的 Mindustry runtime 解析应交给受隔离的 Renderer worker。

论坛主进程不应为了方便直接加载不可信的 Mindustry 内容进入任意高权限运行环境。

---

# 19. Mindustry Renderer

`tools/mindustry-renderer` 是论坛拥有的隔离 Worker。

它承担：

- `.msav` 解析
- `.msch` 解析
- 官方 Mindustry runtime 分析
- preview 生成
- content metadata
- 部分结构化分析

安全边界：

- loopback only
- 不公开 worker port
- 使用独立低权限 OS account
- 无网络出口
- 有 CPU / memory 限制
- 输入大小受限
- worker token 不暴露给客户端
- preview path 必须受控
- Mindustry runtime 版本由 Renderer 构建事实源决定

不要把 Renderer 改成互联网公开服务。

不要让浏览器、第三方客户端或用户直接获得 Renderer credential。

不要为了抓依赖或图标给 Renderer 添加任意网络访问。

---

# 20. Site Profiles

MindFourm 同一代码仓库支持不同站点 Profile。

当前主要 Profile：

```text
mdtbbs
mindustry-club
```

一个运行进程只服务一个 Profile。

Profile 是真实产品策略边界，不只是换 Logo。

## 20.1 Data Isolation

MDTBBS 与 Mindustry Club 必须分别使用：

- MySQL database
- Redis instance / keyspace
- upload volume
- backup
- operation credentials
- OAuth client configuration

**不要让两个部署共享论坛数据库。**

**不要让两个部署共享上传存储。**

资源跨站导入后是目标站的本地资源。

审核、评论、评分、收藏、下载和成员关系不自动跨站共享。

## 20.2 Shared Trunk

共享论坛行为应继续留在 common trunk。

Profile 差异优先表达在：

```text
src/config/site-profile-data.ts
frontend/src/config/site-profile.ts
i18n locale catalogs
capabilities / policy
```

不要仅因为 Club 和 MDTBBS 有几个行为差异，就复制：

- 整个 page
- 整个 service
- 整个 resource module
- 一套长期分叉的后端

真实行为差异通过 profile gate 表达。

---

# 21. Verification Policy

站点写入资格由 Site Profile 和领域策略决定。

典型规则包括：

- MDTBBS 社区写入使用手机号安全验证要求
- Mindustry Club 社区写入使用邮箱验证要求

客户端不应自己猜验证政策。

优先读取：

```text
GET /api/v1/capabilities
GET /api/v1/me
```

以及稳定 permission / error code。

不要在客户端写：

```text
if site === mdtbbs then hardcode xxx
```

来代替服务端 capability/policy。

---

# 22. MindAuth & Authentication

MindAuth 是账号认证中心。

论坛维护本地社区身份、角色、封禁、权限、内容和站点状态。

第三方公开客户端统一采用：

```text
Authorization Code
+
PKCE S256
```

适用于：

- Web integration
- Android
- Desktop
- Launcher
- Mindustry Mod
- 第三方客户端

客户端类型本身不会获得额外权限。

## 22.1 Never Trust Client Branding

不要创建这种授权逻辑：

```text
client says "official"
=> bypass permission
```

也不要因为应用名是：

```text
Android
Launcher
Xenon
Mindustry Mod
```

就自动提高权限。

权限来自：

- 已认证 principal
- OAuth scopes
- 已注册 client capabilities
- 本地角色
- 资源成员关系
- Site Profile
- feature flags
- moderation state
- verification state
- domain policy

## 22.2 Secrets

以下内容禁止放入公开客户端：

- MindAuth 用户密码
- Forum service credential
- `MINDAUTH_CLIENT_SECRET`
- internal API key
- Relay machine secret
- SMTP credential
- object storage secret
- 其他服务器密钥

包括：

- Browser JS
- Android APK
- Desktop bundle
- Launcher
- Mindustry Mod JAR
- public repository

公开客户端只能持有适合公开分发的 identifier，例如 `client_id`。

---

# 23. Capabilities

客户端应优先通过：

```text
GET /api/v1/capabilities
```

发现当前部署能力。

Capability 表示服务端当前支持某项能力。

它不等于：

- 当前用户有权限
- 当前 OAuth token 有 scope
- 当前资源允许操作
- 当前内容通过审核

UI 可以使用 capability 隐藏不可用模块。

真正执行操作时服务端仍必须独立进行权限校验。

不要把 capabilities 当授权凭证。

---

# 24. Frontend

Frontend 使用 Next.js App Router。

依赖版本以：

```text
frontend/package.json
```

为准。

不要在本文件维护 Next/React 等动态版本。

## 24.1 API Transport

Frontend 同时存在 legacy API 与 V1 API。

公共 V1 transport 位于：

```text
frontend/src/lib/api/v1/
```

Legacy API helpers 位于其他现有 API 层。

不要把两个 envelope 处理逻辑散落到页面组件。

不要在每个页面重新手写：

```text
fetch
unwrap
CSRF
error parsing
```

应复用既有 transport。

## 24.2 V1 Errors

Frontend 对 V1 行为判断应使用：

```text
V1ApiError.code
V1ApiError.status
```

不要匹配中文 `message`。

## 24.3 Server vs Browser Fetch

Next.js Server Component 与 Browser 的 API URL 解析方式不同。

不要假设 Node `fetch` 可以解析浏览器相对 URL。

复用现有 URL builder / V1 transport。

---

# 25. Frontend UX

做 UI 修改时：

- 优先保持既有设计系统
- 保证手机端可用
- 不要只完成桌面布局
- loading / empty / error / retry 都应考虑
- destructive action 应明确确认
- permissions / capability 不可用时给出可理解反馈
- 不要将 backend error message 原样当 UI 控制逻辑
- 图片、富文本、资源预览需要考虑加载失败
- 长列表使用正确分页，不一次性加载全部

Resource Center 的 Mod、Map、Schematic、Pack 可以共享 shell，但详情区不要求强行统一成同一种布局。

---

# 26. Android

Android 是公共 V1 API 的第一方消费者之一。

Android 服务端能力原则上应通过相同 `/api/v1/*` 提供。

不要因为 Android 是第一方客户端就复制一套 Android-only domain API。

Android 中：

- 不嵌入服务器 secret
- OAuth 使用公开客户端安全模型
- API 错误依赖稳定 code
- capability 由服务端发现
- token 正确持久化和轮换
- 不信任客户端本地角色判断作为服务器授权

涉及 Android、OAuth 或客户端契约变化时，运行 Android 相关测试和 assemble。

Android SDK / Kotlin / Compose 版本从 Gradle 读取。

---

# 27. Social / Presence

好友、屏蔽、在线状态和富活动状态属于社区社交领域。

屏蔽规则优先于普通社交可见性。

客户端不要自行从原始数据推导：

- 是否能邀请
- 是否能加入
- 是否能请求加入

后端已返回 policy action 时，以后端结果为准。

Presence 是租约/心跳模型。

不要把临时在线状态写成永久事实。

---

# 28. Multiplayer Architecture

MindFourm Multiplayer 是**控制面**。

论坛负责：

- 身份
- 好友关系
- 在线状态
- Rich Activity
- Session metadata
- Invite
- Join Request
- Join Intent
- Candidate exchange
- Relay credential allocation
- Capability / policy

客户端负责：

- STUN
- NAT 探测
- P2P 建连
- Mindustry 游戏协议
- 游戏数据传输

P2P 失败时可以使用独立 Relay Agent。

## Critical Boundary

**论坛 API Server 不转发 Mindustry 游戏流量。**

**论坛 API Server 不保存 Mindustry 游戏数据包。**

不要实现：

```text
Client
  -> MindFourm API Server
  -> raw Mindustry game traffic
```

Relay Agent 是独立数据面组件。

论坛只提供控制和授权。

---

# 29. Public Client Authorization

OAuth scope 表示客户端允许请求某一类操作。

Scope 不替代：

- 用户权限
- 资源角色
- 封禁
- Site Profile
- verification
- terms acceptance
- content moderation
- feature flag
- client capability approval

所有写接口最终仍需领域校验。

不要因为 token 包含某个 scope 就跳过本地权限判断。

---

# 30. Security Invariants

所有来自客户端、第三方服务、上传文件和数据库历史内容的数据都可能不可信。

必须保持以下规则。

## MUST

- 用户输入经过 DTO validation
- HTML 输出经过 sanitization
- 文件路径限制在 managed roots
- 外部 URL 使用安全 URL 校验
- 上传文件限制大小和类型
- 权限检查在服务器执行
- 敏感操作写 audit log
- 稳定错误不暴露 stack trace
- request ID 可用于问题追踪
- rate limit 对高风险接口生效
- OAuth state / PKCE 等认证机制保持完整

## MUST NOT

- 任意拼接用户路径进行文件读写
- 任意执行上传内容
- 暴露内部磁盘路径
- 暴露 secret
- 信任客户端提交的 user role
- 信任客户端提交的审核状态
- 信任客户端提交的 resource owner
- 信任客户端声称自己是第一方
- 在错误响应里返回 stack trace
- 为了调试临时关闭全局安全保护后提交

---

# 31. Soft Delete & Historical Data

已有支持 soft delete 的领域必须继续遵守其生命周期。

不要因为“删除更彻底”就把历史数据改成物理 DELETE。

修改删除逻辑前先确认：

- Entity 是否有 DeleteDateColumn
- 查询是否默认排除 deleted row
- 管理后台是否需要恢复
- 关联对象是否需要保留
- Audit / moderation 是否依赖历史数据

资源 binary 清理与数据库 logical delete 是两件不同的事。

---

# 32. Testing Strategy

测试要求以真实 CI workflow 为最终事实源。

不要在 CLAUDE.md 固定测试数量或 coverage 百分比。

修改代码后，应根据影响面运行最小充分测试集。

## Backend

至少考虑：

```bash
npm run build:backend
npm test -- --runInBand
```

针对改动可先运行相关 spec，再运行完整必要 suite。

## OpenAPI

公共 V1 改动：

```bash
npm run openapi:check
```

## Frontend

```bash
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

## E2E

跨层用户流程：

```bash
npm run test:e2e
```

PR smoke 与 nightly full suite 的具体范围以：

```text
.github/workflows/e2e.yml
```

为准。

## Renderer

涉及：

- `.msav`
- `.msch`
- preview
- renderer metadata
- Mindustry parsing
- production analysis

时运行 Renderer fixture / regression tests。

## Android

涉及：

- Android
- OAuth
- 公共客户端契约
- auth flow

时运行：

```text
Android unit tests
Android debug assemble
```

CI 具体 Gradle task 以 workflow 为准。

---

# 33. Migration Testing

涉及 Migration 时至少验证：

1. Migration 可以从目标旧 Schema 前进。
2. Migration 已注册。
3. 新 Entity 已注册。
4. Build 通过。
5. Migration test 通过。
6. Existing data 不会被错误覆盖。
7. Backfill 可重复执行时应具备幂等语义，或明确不可重复。
8. 大表操作考虑锁表和执行成本。
9. 不依赖 TypeORM synchronize。
10. E2E 使用真实 migration 路径验证。

不要只在一个全新空数据库上验证 Migration。

---

# 34. Definition of Done

任务完成前按影响面检查。

## Backend change

- 编译通过
- 相关 Jest 通过
- 权限与错误路径有测试
- 没有引入 schema drift

## Frontend change

- lint
- typecheck
- build
- mobile layout
- loading / empty / error 状态

## Public V1 change

- 实现
- OpenAPI
- allowlist
- stable errors
- scopes / capabilities
- frontend/client types if applicable
- human docs
- changelog
- contract tests
- `openapi:check`

全部同步。

## Database change

- Migration
- migration registration
- entity registration
- migration test
- backfill/reconciliation if needed

## Resource change

检查：

- Resource / Version / File identity
- revision immutability
- owner / maintainer / publisher
- moderation
- quarantine
- hash
- public download policy
- analyzer safety

## Cross-client change

检查：

- Web
- Android
- Mod / Launcher
- third-party API contract

是否共享同一语义。

---

# 35. Documentation Map

不要在 CLAUDE.md 重复专项规范。

处理对应领域时主动阅读这些文件。

## Public API

```text
docs/api/README.md
docs/api/first-party-v1.md
docs/api/public-client-v1.md
docs/api/game-content-v1.md
docs/api/resources-v1-contract.md
docs/api/multiplayer-v1.md
docs/api/cloud-saves-v1.md
docs/api/rich-content-schema-v2.md
docs/api/errors-v1.md
docs/api/lifecycle-v1.md
docs/api/changelog-v1.md
```

## Resource Center

```text
docs/resource-center-v2.md
src/modules/resources/
src/entities/resource*.entity.ts
```

## Site Profiles

```text
docs/international-site-profiles.md
src/config/site-profile-data.ts
frontend/src/config/site-profile.ts
```

## Renderer

```text
tools/mindustry-renderer/README.md
tools/mindustry-renderer/
```

## CI

```text
.github/workflows/ci.yml
.github/workflows/e2e.yml
```

如果文档路径变化，应更新本节。

---

# 36. Agent Work Style

在本仓库执行任务时：

1. 先阅读相关代码。
2. 再阅读相关专项文档。
3. 查看现有测试。
4. 找到真实事实源。
5. 实现最小完整修改。
6. 补测试。
7. 更新契约和文档。
8. 运行相关验证。
9. 检查 diff。
10. 报告真实状态。

报告中明确区分：

```text
已修改
已测试
已提交
已推送
PR 已创建
CI 已通过
PR 已合并
生产已部署
生产 Migration 已执行
```

这些状态不能互相代替。

不要说“已上线”，除非真的执行并验证了生产部署。

---

# 37. DO NOT

以下规则属于仓库级硬约束。

**DO NOT enable TypeORM `synchronize`.**

**DO NOT introduce database schema changes without a Migration.**

**DO NOT forget Entity or Migration registration.**

**DO NOT expose internal auto-increment IDs as new public identities when a stable `public_id` exists.**

**DO NOT silently break `/api/v1/*`.**

**DO NOT change a public V1 contract without synchronizing OpenAPI, human-readable docs, changelog and tests.**

**DO NOT remove a public API without following the V1 lifecycle/deprecation policy.**

**DO NOT treat a route as public merely because its path contains `/v1/`.**

**DO NOT mix Legacy response envelope assumptions with Public V1.**

**DO NOT mutate an already published ResourceVersion binary in place.**

**DO NOT bypass owner/maintainer/publisher authorization using only `resource.user_id`.**

**DO NOT automatically trust a new resource binary because an older resource version was approved.**

**DO NOT execute uploaded Mod code during analysis.**

**DO NOT expose quarantine files through public paths.**

**DO NOT expose arbitrary filesystem paths to clients.**

**DO NOT assume Resource storage is already content-addressed CAS.**

**DO NOT invent Blob/CAS behavior that the repository has not implemented.**

**DO NOT expose the Mindustry Renderer publicly.**

**DO NOT give the Renderer unrestricted network egress.**

**DO NOT embed passwords, server credentials or OAuth client secrets in Browser, Android, Launcher or Mod code.**

**DO NOT grant privileges based on client branding or application name.**

**DO NOT route Mindustry game traffic through the Forum API Server.**

**DO NOT share MDTBBS and Mindustry Club databases, Redis state, upload volumes or deployment credentials.**

**DO NOT fork entire pages or services merely to implement Site Profile differences.**

**DO NOT treat Markdown as the sole canonical representation of new Rich Content V2.**

**DO NOT duplicate V1 envelope parsing throughout frontend components.**

**DO NOT use client-side permission checks as server authorization.**

**DO NOT hard-code module, Entity, Migration, endpoint or test counts into this file.**

**DO NOT copy dependency versions into this file unless they are an actual compatibility invariant.**

**DO NOT describe planned architecture as already implemented.**

**DO NOT claim production migration, deployment or merge status that was not actually verified.**

---

# 38. Final Rule

如果一个修改看起来“更简单”，但它需要绕过：

- migration
- domain authorization
- public API contract
- moderation
- Site Profile isolation
- resource immutability
- security boundary
- CI validation

那么它通常不是正确的捷径。

先找到已有边界，再沿着边界扩展系统。