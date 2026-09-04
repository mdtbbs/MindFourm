# T&C 条款同意流程设计

## 背景与目标

MindFourm 使用 MindAuth 作为外部 OAuth/SSO 服务，论坛本身负责本地用户与 `forum_session` 会话。目前用户可以直接完成 OAuth 登录，但登录流程没有记录服务条款和隐私政策同意状态。

本功能只修改 MindFourm，不修改 MindAuth：

- 登录页展示并要求用户勾选《服务条款》和《隐私政策》链接
- 新用户首次登录时，OAuth 回调不得直接创建正式论坛 session
- 用户必须在论坛的 `/accept-terms` 页面明确同意后，才创建正式 session
- 管理员更新条款版本后，可要求所有用户重新同意
- 已有用户在首次上线迁移时回填为已接受，避免一次性打断全部现有用户

## 已确认的方案

采用 **Redis 一次性 pending token**，而不是临时 session 或修改 MindAuth。

```text
登录页勾选条款
  → MindAuth OAuth
  → /api/auth/callback
  → 获取/创建本地用户
  → 检查条款版本
  → 已同意：创建正式 session
  → 未同意：Redis 保存 pending token，跳转 /accept-terms?token=...
  → 用户同意
  → POST /api/auth/accept-terms
  → 消费一次性 token，记录接受时间，创建正式 session
  → 跳回原始安全路径
```

## 数据模型与设置

### User 字段

`src/entities/user.entity.ts` 新增：

```typescript
@Column({ type: 'datetime', nullable: true })
terms_accepted_at: Date | null;
```

### 数据库迁移

新增 `src/database/migrations/1720000021000-AddTermsAcceptedToUsers.ts`：

- 若列不存在，向 `users` 添加 `terms_accepted_at DATETIME NULL`
- 将已有用户的空值回填为迁移执行时间 `NOW()`
- `down()` 删除该列
- 在 `src/database/migrations/index.ts` 注册

回填意味着兼容上线：已有用户不会在部署后立即被拦截；新创建用户的值保持 `NULL`，首次登录时需要同意。

### 设置

在 `SettingsService` 中增加并注册：

| Key | 默认值 | 作用 |
|-----|--------|------|
| `terms_required` | `false` | 是否启用条款拦截；默认关闭，管理员确认内容后再开启 |
| `terms_updated_at` | seed 执行时的 ISO 时间 | 当前条款版本时间戳；管理员更新后可触发重新同意 |
| `terms_summary` | 中文短说明 | `/accept-terms` 页面显示的摘要 |

三个 key 加入 `terms` 管理分组。`terms_summary`、`terms_updated_at` 可公开读取；不要公开任何 pending token 或 OAuth token。

默认 `terms_required=false` 是为了避免在部署后、管理员尚未确认法律文案时阻断登录。开启后规则立即生效。

## 后端流程

### 条款状态判断

在 `AuthService` 中提供：

```typescript
checkNeedsTermsAcceptance(user: User): Promise<boolean>
```

规则：

```text
terms_required != true → false
terms_updated_at 无效 → false（避免错误配置导致全站无法登录）
terms_accepted_at 为空 → true
terms_accepted_at < terms_updated_at → true
其他 → false
```

### OAuth callback

修改 `src/modules/auth/auth.controller.ts` 的 `GET /auth/callback`：

1. 继续验证 `code`，交换 MindAuth access/refresh token
2. 获取 MindAuth 用户信息并查找/创建本地用户
3. 计算原始 redirect，并通过现有 `getSafeRedirectPath()` 限制为站内路径
4. 若不需要接受条款，沿用现有 session 创建、HttpOnly Cookie、重定向流程
5. 若需要接受条款：
   - 生成密码学安全的随机 token
   - Redis 写入 `pending_terms:{token}`，TTL 600 秒
   - 保存 `userId`、安全 `redirectPath`、真实客户端 IP、OAuth token
   - 不创建 `forum_session`
   - 重定向 `${FRONTEND_URL}/accept-terms?token=${token}`

pending payload：

```typescript
{
  userId: number;
  redirectPath: string;
  clientIp: string;
  oauthTokens: {
    accessToken: string;
    refreshToken?: string;
  };
}
```

OAuth token 只保存在 Redis 短期 payload 中，不放入 URL、不写入数据库。

### Pending token 服务方法

`AuthService` 提供：

- `storePendingTermsAcceptance(token, payload)`：写入 Redis，TTL 10 分钟
- `consumePendingTermsAcceptance(token)`：读取并删除，确保一次性使用
- `recordTermsAcceptance(userId)`：写入当前时间

消费后严格验证：

- `userId` 是正整数
- `redirectPath` 是安全站内路径
- `accessToken` 存在
- `refreshToken` 可选
- payload JSON 可解析

### 接受条款 API

新增 `POST /auth/accept-terms`，不依赖普通 `JwtAuthGuard`，因为此时尚未创建 session。请求体：

```json
{
  "token": "one-time-token",
  "accepted": true
}
```

接受时：

1. 消费 token
2. 验证 payload
3. 更新 `terms_accepted_at`
4. 创建正式 `forum_session`
5. 使用 pending payload 中保存的真实客户端 IP 和 OAuth token
6. 设置现有 HttpOnly、Secure（生产环境）、SameSite=Lax Cookie
7. 重定向到原始安全路径

拒绝时：

1. 消费并删除 token
2. 不创建 session
3. 重定向首页或登录入口

过期、重复消费、payload 缺失或非法时返回未授权错误，不创建 session。

## 前端流程

### 登录页

修改 `frontend/src/app/(auth)/login/page.tsx`：

- 增加受控复选框
- 显示指向 `/terms`、`/privacy` 的新标签页链接
- 未勾选时禁用 MindAuth 登录按钮
- 保留现有 redirect 参数传递

该勾选是用户意向提示，真正强制校验由 OAuth callback 和 `/accept-terms` 完成。

### 接受页面

新增 `frontend/src/app/(auth)/accept-terms/page.tsx`：

- 从 query string 读取 `token`
- 从 `/api/settings` 尽力读取 `terms_summary`，失败时使用本地默认短说明
- 展示服务条款/隐私政策链接
- 独立复选框控制同意按钮
- “不同意”调用同一 API 并提交 `accepted:false`
- 无 token 时显示错误和返回登录链接
- 请求期间禁用按钮，展示加载状态和错误提示

前端不保存 OAuth token，不解析 pending payload。

## 安全设计

- redirect 使用现有安全路径清洗，拒绝外部 URL、`//` 和反斜杠
- pending token 使用密码学安全随机值
- pending token TTL 10 分钟
- 接受和拒绝都会消费 token，防止重复提交
- 未接受条款前绝不创建正式论坛 session
- Redis payload 不进入 URL，OAuth token 不进入数据库
- Cookie 继续使用 HttpOnly、Secure（生产）和 SameSite=Lax
- `terms_updated_at` 无效时跳过拦截，避免配置错误造成全站登录故障
- 默认关闭 `terms_required`，由管理员确认条款内容后启用
- 接受接口加入现有速率限制，防止 token 接口滥用

## 错误处理

| 情况 | 行为 |
|------|------|
| 缺少 code | OAuth callback 返回未授权错误 |
| 条款未接受 | 跳转 `/accept-terms` |
| token 缺失 | 页面显示重新登录提示 |
| token 过期 | 返回未授权，要求重新登录 |
| token 重复使用 | 返回未授权，不创建 session |
| payload 非法 | 返回未授权，不创建 session |
| 用户拒绝 | 删除 pending 状态，返回首页，不创建 session |
| 条款设置关闭 | 正常创建 session |
| 条款版本时间非法 | 跳过拦截并正常登录 |

## 验证计划

### 后端

- `terms_required=false` 时正常登录
- 新用户在条款开启时被拦截
- 已有用户迁移回填后不被拦截
- 已接受当前版本的用户正常登录
- `terms_updated_at` 更新后旧接受记录重新被拦截
- 接受 token 后创建 session 并写入接受时间
- 拒绝 token 后不创建 session
- 过期 token、重复 token、非法 payload 均失败
- 外部 redirect 被归一化为站内路径
- 接受流程保存真实客户端 IP

### 前端

- 登录页未勾选时按钮禁用
- 勾选后按钮启用
- 条款和隐私链接打开正确页面
- `/accept-terms` 无 token 时显示错误
- 未勾选时同意按钮禁用
- 接受、拒绝、错误和加载状态正确显示

### 构建

```bash
npx tsc --noEmit -p tsconfig.json
cd frontend && npx tsc --noEmit
npm run build
cd frontend && npm run build
```

## 不在本次范围内

- 不修改 MindAuth 项目
- 不新增反馈、投票、群聊或插件前端注入功能
- 不实现条款版本管理后台专用页面；管理员通过设置值更新版本
- 不改动现有 `/terms`、`/privacy` Markdown 内容编辑机制
