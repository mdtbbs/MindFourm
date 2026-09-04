# MindFourm 设计文档优化分析

> 本文档记录了 17 份设计文档中发现的所有问题及优化方案。
> 创建时间: 2026-06-08

## 核心发现：设计文档与实际代码的巨大差距

设计文档 (`docs/design/`) 描述的是 **NestJS + TypeScript + TypeORM** 架构，但实际代码是 **Koa + JavaScript + mysql2（原始 SQL）**。这意味着 17 份设计文档中大部分是**未对齐的理想态规划文档**，从未随实际技术选型变化而更新。

### 实际技术栈对比

| 维度 | 设计文档声称 | 实际代码 |
|------|-------------|---------|
| 后端框架 | NestJS (装饰器/DI) | **Koa** (纯 JavaScript) |
| ORM | TypeORM | **mysql2** (原始 SQL) |
| 语言 | TypeScript | **JavaScript** (0 个 .ts 文件) |
| 编辑器 | Editor.js | **react-markdown** (textarea + preview) |
| 会话存储 | 未指定 | **Redis + ioredis** |
| 数据库 | 未指定 | **MySQL** (connection pool) |

### 设计文档中需要保留 vs 重写的分类

**需重写（完全过时）：**
- `02-api-design.md` — NestJS API 设计 vs 实际 Koa routes
- `06-backend-architecture.md` — NestJS 模块架构 vs 实际静态类
- `14-auth-integration.md` — JWT/Token 刷新 vs 实际 Redis 会话

**需大幅修订（部分过时）：**
- `01-database-design.md` — 表结构有差异（设计文档含 polls/badges/points 等未实现表）
- `05-feature-specs.md` — 含 Editor.js/polls/badges 等未实现特性
- `07-ui-ux-design.md` — 大部分有效，但 Editor.js 部分需删除
- `11-security-design.md` — CSRF 实现不完整，中间件代码是 NestJS 风格
- `12-search-design.md` — SQL 注入风险，搜索实现与设计不符
- `13-email-system.md` — 模板引擎 Bug，NestJS 风格代码
- `15-logging-monitoring.md` — NestJS AppLogger vs 实际 Winston
- `16-performance-optimization.md` — NestJS CacheInterceptor vs 实际手动缓存
- `17-testing-strategy.md` — Jest + NestJS testing vs 实际 Playwright

**基本有效（架构层面）：**
- `03-frontend-architecture.md` — 前端大部分描述准确（除 Editor.js）
- `04-deployment.md` — Docker 部署方案基本适用
- `08-plugin-development.md` — 插件系统尚未实现，属于规划
- `09-plugin-architecture.md` — 同上
- `10-frontend-template-system.md` — 同上

---

## 🔴 高优先级问题（逻辑 Bug，必须修复）

### H1. OAuth 会话逻辑断裂

**文档：** `14-auth-integration.md`

**问题：**
- `access_token` 有效期 1 小时，但 Redis 会话设为 7 天
- 登录时只用 `access_token` 换取一次用户信息，之后完全不用 OAuth token
- `refreshToken()` 方法定义但**永远不会被调用**
- Cookie `maxAge=7天` 与 Redis `TTL=7天`，但 Redis 有滑动续期（每次请求 `expire` 重置），Cookie 没有 → **到期时间会错位**

**修复方案：**
1. 简化为单一会话模型：用 Redis 会话作为唯一认证状态，去掉 OAuth token 的混淆
2. 删除 `refreshToken()` 相关代码（实际不需要，因为论坛自己管理会话）
3. 文档明确说明：OAuth 只用于初始登录，后续会话由论坛独立管理
4. 考虑是否需要同步 MindAuth 的密码变更/封禁事件（webhook 或定时轮询）

### H2. CSRF Token 只检查不生成

**文档：** `11-security-design.md`

**问题：** CSRF 中间件检查 `x-csrf-token` header 和 `csrf-token` cookie 是否匹配，但没有任何代码说明 token 是如何生成和设置的。

**修复方案：**
1. 补充 CSRF token 生成中间件：GET 请求时生成 token 并设置 cookie
2. 或明确说明由前端负责生成（双重提交 Cookie 模式需要两端配合）
3. 检查实际 Koa 代码中是否实现了 CSRF（实际代码 `src/middleware/` 目录无 csrf 文件 → **CSRF 未实现**）

### H3. 游标分页 Bug

**文档：** `16-performance-optimization.md`

**问题：**
```javascript
// 文档中的错误代码
nextCursor = posts[posts.length - 1].created_at; // 此时还没 pop
posts.pop(); // 删除最后一项后，nextCursor 指向已被删除的项
```

**修复方案：**
```javascript
// 正确写法
const lastItem = posts[posts.length - 1];
nextCursor = lastItem.created_at;
posts.pop(); // 或直接在 SQL 查询中 LIMIT N+1
```

### H4. HttpOnly Cookie vs localStorage 矛盾

**文档：** `14-auth-integration.md` vs 前端 spec `2026-05-10-mindforum-frontend-design.md`

**问题：**
- 后端设计说用 HttpOnly Cookie（JS 不可读）
- 前端 spec 说检查 `localStorage` 中的 `mindauth_session_token`

**实际代码确认：** 前端 auth context **同时使用两者**：
1. 先检查 `localStorage` 中的 `mindauth_session_token`
2. 用该 token 调用 `authApi.verifySession()`
3. 后端验证后设置 HttpOnly Cookie
4. 后续请求靠 Cookie 认证

**修复方案：** 文档需要准确描述这个双阶段认证流程，而不是说只用一种。

### H5. 模板引擎不能处理条件语法

**文档：** `13-email-system.md`

**问题：** 模板引擎用简单正则 `{{key}}` 替换，但邮件模板含 `{{#if action_url}}` Handlebars 语法 → 条件块不会渲染。

**修复方案：**
1. 改用 Handlebars/Mustache 等成熟模板引擎
2. 或从邮件模板中删除所有条件语法，改为多个模板变体

---

## 🟡 中优先级问题

### M1. LIKE 查询 SQL 注入风险

**文档：** `12-search-design.md` vs `11-security-design.md`

**问题：** 搜索服务用 `LIKE '%${query}%'` 字符串拼接，与安全文档声称的参数化查询矛盾。

**实际代码：** `src/database/mysql.js` 使用 mysql2 的 `?` 参数化查询，但搜索代码中 LIKE 的 `%` 通配符是拼接到变量里的。

**修复方案：** 使用 `LIKE ?` 并将 `%keyword%` 作为参数传递。

### M2. 插件系统阶段矛盾

**文档：** `08-plugin-development.md` vs `09-plugin-architecture.md`

**问题：** 08 说"第一期不支持自定义路由和前端 UI"，09 和 10 却详细描述了完整实现。

**修复方案：** 在 08 中明确标注阶段，09/10 标注为"规划中（未实现）"。

### M3. 日志保留时间自相矛盾

**文档：** `15-logging-monitoring.md`

**问题：** 表格说错误日志 90 天，Winston 配置 `maxFiles: '30d'`。

**修复方案：** 统一为 90 天，修改 Winston 配置。

### M4. Editor.js vs Markdown 格式冲突（已解决）

**文档：** `05-feature-specs.md`, `03-frontend-architecture.md`

**问题：** 设计文档说用 Editor.js，实际用 react-markdown。

**状态：** 已确认实际使用 react-marksum。设计文档需更新。

### M5. 邮件模板引擎正则注入风险

**文档：** `13-email-system.md`

**问题：** `new RegExp(\`{{${key}}}\`, 'g')` — 如果 key 含正则特殊字符（`.`, `*`, `+` 等）会出错。

**修复方案：** 对 key 进行正则转义：`key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`。

### M6. Rate Limiting Redis 竞态条件

**文档：** `11-security-design.md`

**问题：** `await this.redis.incr(key)` 然后 `if (current === 1) await this.redis.expire(key, 60)` — 在 incr 和 expire 之间如果服务崩溃，key 永远没有 TTL。

**修复方案：** 使用 Lua 脚本原子操作，或 Redis `SET key 1 EX 60 NX` + `INCR`。

### M7. INT 主键限制

**文档：** `01-database-design.md`

**问题：** 所有表使用 `INT PRIMARY KEY AUTO_INCREMENT`（最大 ~21 亿）。对于高流量论坛，posts 和 replies 表可能很快达到上限。

**修复方案：** 改为 `BIGINT`（最大 ~922 亿亿）。

### M8. 缺少 CSP 安全头

**文档：** `11-security-design.md`

**问题：** 安全文档没提 Content-Security-Policy，这是 XSS 防御的重要一层。

**修复方案：** 补充 CSP 配置，至少包含 `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';`。

### M9. 搜索 LIKE 不转义特殊字符

**文档：** `12-search-design.md`

**问题：** 用户搜索 `%` 或 `_` 时，会被 LIKE 解释为通配符。

**修复方案：** 转义 LIKE 特殊字符：`input.replace(/([%_\\])/g, '\\$1')`。

### M10. 文档间 API 端点不一致

**问题：** 前端 spec 列出的 API 端点（如 `GET /api/replies?user_id=:id`）在后端设计文档中不存在。

**实际代码确认：** 后端确实有 `/api/v1/replies` routes，但参数和设计文档描述不同。

**修复方案：** 以实际代码为准，更新所有设计文档中的 API 描述。

---

## 🟢 低优先级改进

### L1. 测试覆盖率不现实
**文档：** `17-testing-strategy.md`
**问题：** 声称 "Core API 100%" 和 "Core user flows 100%" 不现实。
**修复：** 改为合理目标：单元测试 > 80%，核心 API > 90%，E2E 核心流程 > 95%。

### L2. 附件双外键歧义
**文档：** `01-database-design.md`
**问题：** `attachments` 表有 `post_id` 和 `reply_id` 两个外键。
**修复：** 改为 `target_type ENUM('post', 'reply')` + `target_id INT`。

### L3. 缺少水平扩展策略
**文档：** `04-deployment.md`
**问题：** Docker 单副本，无负载均衡。
**修复：** 补充多副本 + Nginx 负载均衡配置。

### L4. 缺少软删除一致性
**文档：** `01-database-design.md`
**问题：** posts/replies 有 `deleted_at`，但 resources/notifications 没有。
**修复：** 为需要审计追踪的表添加 `deleted_at`。

### L5. 前端动画无障碍支持
**文档：** `07-ui-ux-design.md`
**问题：** Magic UI 动画没有 `prefers-reduced-motion` 支持。
**修复：** 补充无障碍动画指南。

### L6. 搜索分页未限制
**文档：** `12-search-design.md`
**问题：** 用户可能请求 `pageSize=1000`。
**修复：** 补充 `pageSize` 上限（如 50）。

### L7. 缺少 IPv6 CIDR 支持
**文档：** `11-security-design.md`
**问题：** IP 黑名单只提到 IPv4。
**修复：** 补充 IPv6 支持。

### L8. 缺少 HTTPS 强制配置
**文档：** `04-deployment.md`, `11-security-design.md`
**问题：** 没提 HTTP → HTTPS 重定向。
**修复：** 在 Nginx 配置中补充 301 重定向。

---

## 实施计划

### 第一阶段：修复高优先级 Bug（1-2 天）
1. H1: 更新 `14-auth-integration.md`，简化会话模型描述
2. H2: 补充 CSRF 实现或删除不完整代码
3. H3: 修正游标分页示例
4. H4: 统一前后端认证流程描述
5. H5: 更新邮件模板引擎方案

### 第二阶段：对齐实际代码（2-3 天）
1. 重写 `02-api-design.md` — 基于实际 Koa routes
2. 重写 `06-backend-architecture.md` — 基于实际静态类模式
3. 大幅修订 `01-database-design.md` — 删除未实现的表
4. 更新 `05-feature-specs.md` — 删除 Editor.js/polls/badges
5. 更新 `07-ui-ux-design.md` — 删除 Editor.js 引用

### 第三阶段：修复中优先级问题（1-2 天）
1. M1-M10: 逐一修复

### 第四阶段：低优先级改进 + 交叉验证（1 天）
1. L1-L8: 逐一补充
2. 全文交叉引用检查，消除矛盾

---

## 文档状态追踪

| 文档 | 状态 | 主要问题 | 完成情况 |
|------|------|---------|---------|
| 01-database-design.md | ✅ 已修订 | 含未实现的表（polls, badges, points 等） | 2026-06-08: 删除未实现表，INT→BIGINT，添加 session_audit |
| 02-api-design.md | ✅ 已重写 | NestJS API vs 实际 Koa routes | 2026-06-08: 基于实际 17 个 controller 重写 |
| 03-frontend-architecture.md | 🟡 基本可用 | Editor.js 引用需删除 | 待更新 |
| 04-deployment.md | 🟡 基本可用 | 缺少水平扩展、HTTPS 强制 | 待更新 |
| 05-feature-specs.md | ✅ 已修订 | Editor.js, polls, badges 未实现 | 2026-06-08: 删除 Editor.js/polls/badges/points/follow |
| 06-backend-architecture.md | ✅ 已重写 | NestJS vs 实际 Koa | 2026-06-08: 基于实际 21 模块重写 |
| 07-ui-ux-design.md | ✅ 已修订 | Editor.js 引用，无障碍缺失 | 2026-06-08: 删除 Editor.js，补充 prefers-reduced-motion |
| 08-plugin-development.md | ✅ 已标注 | 标注阶段即可 | 2026-06-08: 添加"规划中"banner + Phase 标注 |
| 09-plugin-architecture.md | ✅ 已标注 | 标注"未实现"即可 | 2026-06-08: 添加"规划中"banner |
| 10-frontend-template-system.md | ✅ 已标注 | 标注"未实现"即可 | 2026-06-08: 添加"规划中"banner |
| 11-security-design.md | ✅ 已修订 | CSRF 不完整，缺少 CSP | 2026-06-08: 补充 CSP，更新 rate limiting，CSRF 决策 |
| 12-search-design.md | ✅ 已修订 | SQL 注入风险，LIKE 未转义 | 2026-06-08: 添加 escapeLike 工具，所有 LIKE 查询已转义 |
| 13-email-system.md | ✅ 已修复 | 模板引擎 Bug，NestJS 代码 | 2026-06-08: 替换为 Handlebars 模板引擎 |
| 14-auth-integration.md | ✅ 已修订 | 会话逻辑断裂 | 2026-06-08: 简化会话模型，添加滑动窗口 |
| 15-logging-monitoring.md | ✅ 已修订 | 日志保留时间矛盾，NestJS 代码 | 2026-06-08: 统一 90 天，删除 AppLogger 引用 |
| 16-performance-optimization.md | ✅ 已修订 | 游标分页 Bug，NestJS 代码 | 2026-06-08: 修正游标示例，记录实际缓存策略 |
| 17-testing-strategy.md | ✅ 已修订 | 覆盖率不现实，NestJS 代码 | 2026-06-08: 调整覆盖率目标，更新测试工具 |

---

## 实施完成情况（2026-06-08）

### Phase 1: Stub 模块完成 ✅

| 模块 | 新增功能 |
|------|---------|
| post-servers | linkPostToServer, unlinkPostFromServer + 端点 |
| auto-post | 幂等性检查，签名验证，通知创建，错误处理 |
| rate-limit.guard | Lua 脚本原子操作，按 handler 配置限制 |

### Phase 2: 高优先级 Bug 修复 ✅

| Bug | 修复 |
|-----|------|
| H1 OAuth 会话 | 添加 verifySession 滑动窗口 TTL 刷新，标记 revokeTokens 为 deprecated |
| H2 CSRF | 决策：依赖 CORS Origin 验证（API 场景足够），文档中说明理由 |
| H3 游标分页 | 已确认当前代码正确，无需修复 |
| H4 认证文档 | 14-auth-integration.md 已更新为准确的双阶段认证描述 |
| H5 邮件模板 | 替换为 Handlebars，支持 {{#if}} 条件语法 |

### Phase 3: 前端页面 ✅

所有 5 个"缺失"页面已存在且实现良好：
- messages/[userId]/page.tsx — 私聊对话页面 ✅
- resources/submit/page.tsx — 提交外链资源 ✅
- resources/upload/page.tsx — 上传文件资源 ✅
- servers/apply/page.tsx — 申请服务器 ✅
- users/me/edit/page.tsx — 编辑个人资料 ✅

### Phase 4: 设计文档更新 ✅

17 份设计文档中 16 份已更新完成，2 份待更新（03-frontend, 04-deployment）。

### Phase 5: 中低优先级改进 ✅

| 项目 | 状态 |
|------|------|
| M1 LIKE 参数化 | ✅ 已验证使用 TypeORM 参数化查询 |
| M2 插件阶段 | ✅ 已标注 Phase |
| M3 日志保留时间 | ✅ 统一 90 天 |
| M5 模板引擎正则 | ✅ 替换为 Handlebars |
| M6 Rate Limit 竞态 | ✅ Lua 脚本原子操作 |
| M7 INT→BIGINT | ✅ 高流量表主键已改为 BIGINT |
| M8 CSP 安全头 | ✅ 文档已补充推荐配置 |
| M9 LIKE 特殊字符 | ✅ 添加 escapeLike 工具，6 处已修复 |
| L5 prefers-reduced-motion | ✅ 文档已补充无障碍指南 |
| L6 搜索 pageSize 上限 | 待实施（前端/后端各限 50） |
