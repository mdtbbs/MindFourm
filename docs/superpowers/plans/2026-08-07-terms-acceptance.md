# T&C 条款同意流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改 MindAuth 的前提下，为 MindFourm 增加可版本化的服务条款/隐私政策强制同意流程，并在接受后才创建正式论坛 session。

**Architecture:** OAuth callback 负责检查条款版本；不满足条件时将最小必要的用户、重定向、客户端 IP 和一次性 OAuth token payload 放入 Redis，使用 10 分钟 pending token 跳转到 `/accept-terms`。接受接口消费 token、记录 `terms_accepted_at` 并创建正式 session；默认 `terms_required=false`，迁移把既有用户回填为迁移时间，避免兼容性中断。

**Tech Stack:** NestJS 10, TypeORM 0.3, MySQL, Redis/ioredis wrapper, Next.js 14 App Router, React 18, TypeScript, Jest.

## Global Constraints

- 不修改 MindAuth 项目。
- 不把 OAuth token 放进 URL 或数据库；只在 Redis pending payload 中保存 10 分钟。
- 未接受条款前不得创建正式 `forum_session`。
- 所有 redirect 必须经过 `getSafeRedirectPath()`，只允许站内路径。
- `terms_required` 默认值为 `false`；管理员确认条款内容后再开启。
- 既有用户在迁移时将 `terms_accepted_at` 回填为 `NOW()`；新用户保持 `NULL`。
- pending token 必须使用密码学安全随机值，并且接受/拒绝都只能消费一次。
- 继续使用 HttpOnly、生产环境 Secure、SameSite=Lax 的论坛 cookie。
- 不引入新依赖；复用既有 SettingsService、RedisService、AuthService、Alert、Button 和项目的测试/构建命令。
- 本计划只实现 T&C，不实现反馈、投票或插件前端注入。

## 文件结构与职责

| 文件 | 职责 |
|------|------|
| `src/entities/user.entity.ts` | 增加 `terms_accepted_at` ORM 字段 |
| `src/database/migrations/1720000021000-AddTermsAcceptedToUsers.ts` | 增加字段并兼容回填既有用户 |
| `src/database/migrations/index.ts` | 注册迁移 |
| `src/modules/settings/settings.service.ts` | 注册条款开关、版本时间和摘要设置 |
| `src/modules/auth/auth.service.ts` | 判断条款状态、存取 pending payload、记录接受时间 |
| `src/modules/auth/auth.controller.ts` | OAuth callback gate 与 `POST /auth/accept-terms` |
| `src/modules/auth/auth.module.ts` | 注入 SettingsModule |
| `frontend/src/app/(auth)/login/page.tsx` | 登录前条款意向勾选 |
| `frontend/src/app/(auth)/accept-terms/page.tsx` | pending token 条款确认页 |
| `src/modules/auth/*.spec.ts` | callback、pending token、接受接口测试；沿用现有测试工具和 mock 模式 |

---

### Task 1: 锁定并验证当前工作区基线

**Files:**
- Read: `docs/superpowers/specs/2026-08-07-terms-acceptance-design.md`
- Read: `src/modules/auth/auth.service.ts`
- Read: `src/modules/auth/auth.controller.ts`
- Read: `src/database/redis.service.ts`
- Read: `src/modules/settings/settings.service.ts`

**Interfaces:**
- Consumes: 已存在但未提交的 T&C 实现改动。
- Produces: 一个可核对的基线；不得覆盖与 T&C 无关的用户工作区改动。

- [ ] **Step 1: 检查工作区和基线提交**

```bash
git status --short
git log --oneline -5
```

Expected: 只确认 T&C 相关未提交改动；若发现无关改动，保留它们，不纳入本功能 commit。

- [ ] **Step 2: 运行现有类型检查，记录基线**

```bash
npx tsc --noEmit -p tsconfig.json
cd frontend && npx tsc --noEmit
```

Expected: 记录命令结果；若出现旧问题，区分基线错误与本任务错误，不能用本任务改动掩盖无关错误。

- [ ] **Step 3: 确认 Redis wrapper 签名**

在 `src/database/redis.service.ts` 确认使用的是：

```typescript
set(key: string, value: string, ttl?: number): Promise<'OK' | null>
get(key: string): Promise<string | null>
del(key: string): Promise<number>
```

Implementation must pass `600` as the third argument, not raw ioredis arguments such as `'EX', 600`.

- [ ] **Step 4: Commit only if baseline cleanup is needed**

```bash
git add <only-terms-files>
git commit -m "chore(auth): checkpoint terms acceptance baseline"
```

Do not commit unrelated files or push in this task.

---

### Task 2: Add the user field and compatible migration

**Files:**
- Modify: `src/entities/user.entity.ts:75-86`
- Create: `src/database/migrations/1720000021000-AddTermsAcceptedToUsers.ts`
- Modify: `src/database/migrations/index.ts:16,43`
- Test: `src/database/migrations/migration-utils.spec.ts` only if the project has migration integration coverage for new columns; otherwise verify through TypeScript and migration SQL review.

**Interfaces:**
- Consumes: TypeORM `User`, `columnExists()` from `migration-utils`.
- Produces: `User.terms_accepted_at: Date | null`; migration class `AddTermsAcceptedToUsers1720000021000`.

- [ ] **Step 1: Add the entity field**

```typescript
@Column({ type: 'datetime', nullable: true })
terms_accepted_at: Date | null;
```

Place it after `phone_verified_at` and before `created_at` so entity order matches migration placement.

- [ ] **Step 2: Implement idempotent migration**

```typescript
export class AddTermsAcceptedToUsers1720000021000 implements MigrationInterface {
  name = 'AddTermsAcceptedToUsers1720000021000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await columnExists(queryRunner, 'users', 'terms_accepted_at'))) {
      await queryRunner.query(
        'ALTER TABLE `users` ADD COLUMN `terms_accepted_at` DATETIME NULL AFTER `phone_verified_at`',
      );
      await queryRunner.query(
        'UPDATE `users` SET `terms_accepted_at` = NOW() WHERE `terms_accepted_at` IS NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await columnExists(queryRunner, 'users', 'terms_accepted_at')) {
      await queryRunner.query('ALTER TABLE `users` DROP COLUMN `terms_accepted_at`');
    }
  }
}
```

The backfill must happen only when adding the column, so rerunning an already-applied migration cannot overwrite later acceptance timestamps.

- [ ] **Step 3: Register the migration**

Add the import and append `AddTermsAcceptedToUsers1720000021000` after `RemoveForumQQAuth1720000018000` in the migrations array.

- [ ] **Step 4: Run checks**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: PASS; no `User` type errors.

- [ ] **Step 5: Commit**

```bash
git add src/entities/user.entity.ts src/database/migrations/1720000021000-AddTermsAcceptedToUsers.ts src/database/migrations/index.ts
git commit -m "feat(auth): track terms acceptance timestamp"
```

---

### Task 3: Register terms settings and auth dependencies

**Files:**
- Modify: `src/modules/settings/settings.service.ts:241-379,398-465`
- Modify: `src/modules/auth/auth.module.ts:9-24`

**Interfaces:**
- Consumes: `SettingsService.get()`, `SettingsService.getBoolean()`, existing settings category filtering.
- Produces: public settings `terms_required`, `terms_updated_at`, `terms_summary`; admin category `terms`; `AuthService` constructor dependency on `SettingsService`.

- [ ] **Step 1: Add public allowlist keys**

Add only these keys to `PUBLIC_KEYS`:

```typescript
'terms_required',
'terms_updated_at',
'terms_summary',
```

Never add pending token, OAuth token, or user-specific acceptance data to public settings.

- [ ] **Step 2: Add the terms admin category**

```typescript
terms: new Set([
  'terms_required',
  'terms_updated_at',
  'terms_summary',
]),
```

- [ ] **Step 3: Seed safe defaults**

```typescript
{ key: 'terms_required', value: 'false', category: 'terms', description: 'Require users to accept Terms & Privacy before forum access' },
{ key: 'terms_updated_at', value: new Date().toISOString(), category: 'terms', description: 'Bump to force all users to re-accept terms' },
{ key: 'terms_summary', value: '使用本站前请阅读并同意我们的服务条款与隐私政策。', category: 'terms', description: 'Short guidance text shown on the terms acceptance screen' },
```

`seedDefaults()` must remain INSERT IGNORE so existing values are not overwritten.

- [ ] **Step 4: Import SettingsModule into AuthModule**

Add `SettingsModule` to `imports`. This makes `SettingsService` available to `AuthService` using the existing module export.

- [ ] **Step 5: Run backend type check**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/settings/settings.service.ts src/modules/auth/auth.module.ts
git commit -m "feat(auth): add configurable terms settings"
```

---

### Task 4: Implement AuthService terms state and pending token helpers

**Files:**
- Modify: `src/modules/auth/auth.service.ts` near imports, constructor, and session-token methods
- Test: `src/modules/auth/auth.service.spec.ts` if present; otherwise create `src/modules/auth/terms-acceptance.service.spec.ts` with mocked repository, RedisService, ConfigService, PointsService, NotificationsService, SettingsService.

**Interfaces:**
- Consumes: `User.terms_accepted_at`, `SettingsService.getBoolean/get`, `RedisService.set/get/del`.
- Produces:

```typescript
checkNeedsTermsAcceptance(user: User): Promise<boolean>
storePendingTermsAcceptance(token: string, payload: PendingTermsPayload): Promise<void>
consumePendingTermsAcceptance(token: string): Promise<PendingTermsPayload | null>
recordTermsAcceptance(userId: number): Promise<void>
```

Define an internal `PendingTermsPayload` type:

```typescript
type PendingTermsPayload = {
  userId: number;
  redirectPath: string;
  clientIp: string;
  oauthTokens: { accessToken: string; refreshToken?: string };
};
```

- [ ] **Step 1: Write failing unit tests for terms state**

Cover these cases:

```typescript
it('returns false when terms_required is disabled', async () => {
  settings.getBoolean.mockResolvedValue(false);
  expect(await service.checkNeedsTermsAcceptance(userWithoutAcceptance)).toBe(false);
});

it('requires a user with no acceptance timestamp', async () => {
  settings.getBoolean.mockResolvedValue(true);
  settings.get.mockResolvedValue('2026-08-01T00:00:00.000Z');
  expect(await service.checkNeedsTermsAcceptance(userWithoutAcceptance)).toBe(true);
});

it('requires acceptance after the current terms version', async () => {
  settings.getBoolean.mockResolvedValue(true);
  settings.get.mockResolvedValue('2026-08-07T00:00:00.000Z');
  expect(await service.checkNeedsTermsAcceptance({ ...user, terms_accepted_at: new Date('2026-08-06') })).toBe(true);
});

it('consumes a pending token exactly once and validates payload shape', async () => {
  redis.get.mockResolvedValue(JSON.stringify(validPayload));
  expect(await service.consumePendingTermsAcceptance('token')).toEqual(validPayload);
  expect(redis.del).toHaveBeenCalledWith('pending_terms:token');
});

it('returns null for malformed pending payload', async () => {
  redis.get.mockResolvedValue('{bad json');
  expect(await service.consumePendingTermsAcceptance('token')).toBeNull();
});
```

Also test expired/absent Redis value, invalid timestamp, and `recordTermsAcceptance()` repository update.

- [ ] **Step 2: Run the focused test and verify it fails**

```bash
npm test -- --runInBand src/modules/auth/terms-acceptance.service.spec.ts
```

Expected: FAIL because the helpers or test module do not yet exist.

- [ ] **Step 3: Implement the helpers minimally**

Use `SettingsService.getBoolean('terms_required', false)`. If disabled or `terms_updated_at` is missing/invalid, return false. Compare `Date` values for all other cases.

`storePendingTermsAcceptance()` must call:

```typescript
await this.redisService.set(
  `pending_terms:${token}`,
  JSON.stringify(payload),
  600,
);
```

`consumePendingTermsAcceptance()` must `get`, immediately `del` when present, parse JSON, and return null for malformed or structurally invalid data. It must validate positive integer `userId`, safe absolute internal `redirectPath`, non-empty `accessToken`, and string `clientIp`.

`recordTermsAcceptance()` calls:

```typescript
await this.usersRepository.update(userId, { terms_accepted_at: new Date() });
```

- [ ] **Step 4: Run focused tests**

```bash
npm test -- --runInBand src/modules/auth/terms-acceptance.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run backend type check**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth/auth.service.ts src/modules/auth/terms-acceptance.service.spec.ts
git commit -m "feat(auth): add pending terms acceptance state"
```

---

### Task 5: Gate OAuth callback and add accept-terms endpoint

**Files:**
- Modify: `src/modules/auth/auth.controller.ts:1-165,225`
- Test: `src/modules/auth/auth.controller.spec.ts` or add focused controller tests using mocked AuthService.

**Interfaces:**
- Consumes: `AuthService.checkNeedsTermsAcceptance()`, `storePendingTermsAcceptance()`, `consumePendingTermsAcceptance()`, `recordTermsAcceptance()`, `generateSessionToken()`, `createSession()`.
- Produces: `GET /auth/callback` gate and `POST /auth/accept-terms`.

- [ ] **Step 1: Write failing controller tests**

Test that callback:

```typescript
it('redirects to accept-terms and does not create a session when acceptance is required', async () => {
  auth.checkNeedsTermsAcceptance.mockResolvedValue(true);
  await controller.callback('code', '/', req, res);
  expect(auth.storePendingTermsAcceptance).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ userId: user.id, redirectPath: '/' }),
  );
  expect(auth.createSession).not.toHaveBeenCalled();
  expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/accept-terms?token='));
});

it('creates a normal session when acceptance is not required', async () => {
  auth.checkNeedsTermsAcceptance.mockResolvedValue(false);
  await controller.callback('code', '/', req, res);
  expect(auth.createSession).toHaveBeenCalledWith(user.id, expect.any(String), expect.any(String), expect.any(Object));
});
```

Test `acceptTerms` for accepted, rejected, missing token, expired token, and malformed payload. Assert that rejected/invalid requests never call `createSession`.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npm test -- --runInBand src/modules/auth/auth.controller.spec.ts
```

Expected: FAIL until the route behavior matches.

- [ ] **Step 3: Add callback gate**

After `getOrCreateUser()` and before normal session creation:

```typescript
const redirectPath = getSafeRedirectPath(state);
if (await this.authService.checkNeedsTermsAcceptance(user)) {
  const pendingToken = crypto.randomBytes(16).toString('hex');
  await this.authService.storePendingTermsAcceptance(pendingToken, {
    userId: user.id,
    redirectPath,
    clientIp: (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, ''),
    oauthTokens: { accessToken, refreshToken },
  });
  return res.redirect(`${frontendUrl}/accept-terms?token=${pendingToken}`);
}
```

Keep the existing normal flow for users that do not need acceptance and pass the real IP into `createSession()`.

- [ ] **Step 4: Add `POST /auth/accept-terms`**

Use a DTO or an inline validated body matching:

```typescript
{ token: string; accepted: boolean }
```

Consume and validate the pending payload. On `accepted=false`, redirect to `${frontendUrl}/`. On true, call `recordTermsAcceptance()`, create the session using `pending.clientIp`, set the existing cookie options, and redirect to `pending.redirectPath`.

The endpoint must use `@SkipPhoneVerification()` and `@RateLimit({ max: 10, window: 60 })`; it must not require the normal session guard.

- [ ] **Step 5: Run tests and type check**

```bash
npm test -- --runInBand src/modules/auth/auth.controller.spec.ts
npx tsc --noEmit -p tsconfig.json
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth/auth.controller.ts src/modules/auth/auth.controller.spec.ts

git commit -m "feat(auth): enforce terms acceptance before session creation"
```

---

### Task 6: Implement login and acceptance UI

**Files:**
- Modify: `frontend/src/app/(auth)/login/page.tsx`
- Create: `frontend/src/app/(auth)/accept-terms/page.tsx`
- Test: Existing frontend test setup if available; otherwise use TypeScript/build plus manual browser checks.

**Interfaces:**
- Consumes: `GET /api/settings`, `POST /api/auth/accept-terms`.
- Produces: Login consent gate and `/accept-terms?token=...` user flow.

- [ ] **Step 1: Update login page**

Use a controlled `agreed` boolean:

```tsx
const [agreed, setAgreed] = useState(false);

<Button disabled={!agreed} onClick={handleMindAuthLogin}>
  使用论坛账号登录
</Button>
```

Render links with `target="_blank" rel="noopener noreferrer"` to `/terms` and `/privacy`. Preserve the existing `redirect` query parameter when constructing the MindAuth URL.

- [ ] **Step 2: Add acceptance page**

The page must:

- use `useSearchParams()` to read `token`
- show an error and `/login` link when token is missing
- fetch public settings best-effort for `terms_summary`, with a local fallback
- show links to `/terms` and `/privacy`
- disable the acceptance button until checked
- submit `{ token, accepted: true|false }` to `/api/auth/accept-terms`
- show loading and error states
- never expose or store OAuth token data

- [ ] **Step 3: Run frontend type check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Build frontend**

```bash
npm run build
```

Expected: PASS and route `/accept-terms` is generated successfully.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/(auth)/login/page.tsx" "frontend/src/app/(auth)/accept-terms/page.tsx"
git commit -m "feat(frontend): add terms consent gate and acceptance page"
```

---

### Task 7: Add admin settings UI for enabling/versioning terms

**Files:**
- Create or modify: `frontend/src/app/admin/settings/terms/page.tsx`
- Modify: `frontend/src/app/admin/settings/layout.tsx` and/or settings navigation registry, based on the existing settings layout pattern.

**Interfaces:**
- Consumes: `adminApi.getSettings('terms')`, `adminApi.updateSettings('terms', values)`.
- Produces: Admin controls for `terms_required`, `terms_updated_at`, and `terms_summary`.

- [ ] **Step 1: Copy the existing settings page pattern**

Follow `frontend/src/app/admin/settings/moderation/page.tsx` and `features/page.tsx`: controlled values, loading/error/success alerts, `useSettingsSaveRefresh()`, and `adminApi` calls.

- [ ] **Step 2: Add the three controls**

- `terms_required`: checkbox/switch with warning text explaining that enabling it gates new logins.
- `terms_updated_at`: datetime/text control with a “更新版本时间” action that sets the current ISO timestamp.
- `terms_summary`: textarea for the acceptance-page summary.

Do not expose `terms_updated_at` as an uncontrolled arbitrary URL or allow empty invalid values to silently create a broken gate.

- [ ] **Step 3: Add the page to admin navigation**

Add a legal/settings entry labelled `条款设置` under the existing settings navigation, restricted to admin roles using the same role convention as neighboring settings pages.

- [ ] **Step 4: Verify settings UI**

```bash
cd frontend
npx tsc --noEmit
npm run build
```

Expected: PASS; `/admin/settings/terms` builds and the settings form can load/save the terms category.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/settings/terms frontend/src/app/admin/settings/layout.tsx

git commit -m "feat(admin): add terms enforcement settings"
```

---

### Task 8: End-to-end verification and final review

**Files:**
- Test: Relevant auth tests and build outputs
- Modify: Any T&C file only if verification exposes a defect.

**Interfaces:**
- Consumes: All previous task commits.
- Produces: Verified, reviewable T&C implementation with no unrelated changes.

- [ ] **Step 1: Run focused tests**

```bash
npm test -- --runInBand src/modules/auth/terms-acceptance.service.spec.ts src/modules/auth/auth.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run complete type checks**

```bash
npx tsc --noEmit -p tsconfig.json
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run production builds**

```bash
npm run build
cd frontend && npm run build
```

Expected: PASS; `/accept-terms`, `/terms`, and `/privacy` routes compile.

- [ ] **Step 4: Verify migration and settings behavior**

Against a disposable database or migration test:

```sql
SHOW COLUMNS FROM users LIKE 'terms_accepted_at';
SELECT COUNT(*) FROM users WHERE terms_accepted_at IS NULL;
SELECT `key`, `value` FROM settings WHERE `key` IN ('terms_required', 'terms_updated_at', 'terms_summary');
```

Expected: field exists; existing users are backfilled; settings have seeded values; rerunning seed does not overwrite admin values.

- [ ] **Step 5: Manually verify login paths**

1. With `terms_required=false`, OAuth callback creates a normal session.
2. With `terms_required=true` and a new user, callback redirects to `/accept-terms` and no `forum_session` exists before acceptance.
3. Missing/expired/reused token fails safely.
4. Accepting creates the cookie and returns to the original safe path.
5. Rejecting returns home without a session.
6. Moving `terms_updated_at` into the future forces an existing user to accept again.

- [ ] **Step 6: Inspect the final diff**

```bash
git status --short
git diff origin/master...HEAD --check
git log --oneline origin/master..HEAD
```

Expected: only T&C files and the design/plan docs are present; no feedback, polls, plugin, or unrelated QQ changes are included.

- [ ] **Step 7: Create final integration commit if needed**

If all tasks were committed separately, no squashing is required. Otherwise:

```bash
git add <verified-terms-files>
git commit -m "feat(auth): complete terms acceptance flow"
```

Do not push without a separate user instruction.
