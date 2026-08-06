# Frontend Async States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize loading, empty, and error states across high-frequency MindFourm frontend pages while preserving existing data during refresh and providing actionable retries.

**Architecture:** Add small shared UI primitives (`StatePanel`, `EmptyState`, `ErrorState`, `InlineLoading`, `Skeleton`) using existing tokens and lucide icons. Migrate pages in focused batches: public content first, then messages/notifications, then admin lists, and finally route loading boundaries and verification. Page-level fetches must distinguish loading, error, empty, and data instead of converting failures into empty arrays.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, existing `LoadingSpinner`, `PageLoader`, page/post skeletons, lucide-react, Tailwind/CSS variables, Playwright where existing setup supports it.

## Global Constraints

- Do not modify backend APIs, database schemas, or response envelopes.
- Do not introduce a new dependency.
- Use existing CSS variables/surface tokens and lucide icons.
- State precedence is `loading -> error -> empty -> data`.
- Only successful empty responses render empty states; request failures must remain errors.
- During refresh/load-more, preserve already loaded rows and use local loading indicators.
- Details pages must distinguish `notFound()` from retryable request failures.
- New user-facing state copy should be Chinese; do not add unexplained English `Loading...` text.
- Keep existing specialized skeletons (`PostSkeleton`, `PostListSkeleton`, `PostDetailSkeleton`, `UserProfileSkeleton`) and wrap/reuse them rather than replacing them.
- Each batch must pass `cd frontend && npx tsc --noEmit` and `npm run build` before commit.
- Do not implement feedback, polls, group chat, plugin injection, or backend changes in this plan.

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/components/ui/state-panel.tsx` | Shared status layout with icon, title, description, actions |
| `frontend/src/components/ui/empty-state.tsx` | Empty-data wrapper and CTA semantics |
| `frontend/src/components/ui/error-state.tsx` | Retryable error wrapper and alert semantics |
| `frontend/src/components/ui/inline-loading.tsx` | Compact local loading state for refresh/load-more |
| `frontend/src/components/ui/skeleton.tsx` | Basic token-based skeleton primitive |
| `frontend/src/app/(public)/loading.tsx` | Public route-group loading boundary |
| `frontend/src/app/admin/loading.tsx` | Admin loading boundary |
| Public page files | Explicit fetch error/empty/loading state migration |
| Message/notification page files | Explicit client request states and retry |
| Admin list files | Consistent list loading/error/empty behavior |

---

### Task 1: Build Shared Async-State Primitives

**Files:**
- Create: `frontend/src/components/ui/state-panel.tsx`
- Create: `frontend/src/components/ui/empty-state.tsx`
- Create: `frontend/src/components/ui/error-state.tsx`
- Create: `frontend/src/components/ui/inline-loading.tsx`
- Create: `frontend/src/components/ui/skeleton.tsx`
- Read: `frontend/src/components/ui/loading-spinner.tsx`
- Read: `frontend/src/components/ui/error-boundary.tsx`
- Read: `frontend/src/components/ui/button.tsx`

**Interfaces:**
- Produces:
  ```typescript
  type StateAction = {
    label: string;
    onClick?: () => void;
    href?: string;
  };

  type StatePanelProps = {
    icon?: React.ElementType;
    title: string;
    description?: string;
    action?: StateAction;
    secondaryAction?: StateAction;
    role?: 'status' | 'alert';
    className?: string;
  };

  type EmptyStateProps = Omit<StatePanelProps, 'role'>;
  type ErrorStateProps = Omit<StatePanelProps, 'role'> & {
    onRetry?: () => void;
  };
  ```
- Consumes: Existing token variables, Button, LoadingSpinner and lucide icons.

- [ ] **Step 1: Add StatePanel implementation**

  Render a centered stable panel with optional icon, title, description, primary and secondary actions. Render `href` actions as `Link`, callback actions as `Button`. Use `role="status"` by default and allow `role="alert"` for errors.

- [ ] **Step 2: Add EmptyState and ErrorState wrappers**

  `EmptyState` delegates to `StatePanel` with `role="status"`. `ErrorState` delegates with `role="alert"`; if `onRetry` exists, add a localized `重试` action while allowing an explicit action to override it.

- [ ] **Step 3: Add InlineLoading and Skeleton**

  `InlineLoading` renders `LoadingSpinner` with a Chinese optional label and stable `min-height`. `Skeleton` accepts `className` and renders a token-based shimmer block; it must not add a second animation system.

- [ ] **Step 4: Type-check primitives**

  Run:
  ```bash
  cd frontend
  npx tsc --noEmit
  ```
  Expected: PASS.

- [ ] **Step 5: Commit primitives**

  ```bash
  git add frontend/src/components/ui/state-panel.tsx frontend/src/components/ui/empty-state.tsx frontend/src/components/ui/error-state.tsx frontend/src/components/ui/inline-loading.tsx frontend/src/components/ui/skeleton.tsx
  git commit -m "feat(frontend): add shared async state components"
  ```

---

### Task 2: Migrate Public Home, Posts, Resources, and Search

**Files:**
- Modify: `frontend/src/app/(public)/page.tsx`
- Modify: `frontend/src/app/(public)/posts/[id]/page.tsx`
- Modify: `frontend/src/app/(public)/posts/new/page.tsx` only if its form exposes page-level loading/error gaps
- Modify: `frontend/src/app/(public)/resources/page.tsx`
- Modify: `frontend/src/app/(public)/resources/[id]/page.tsx`
- Modify: `frontend/src/components/forum/resource-load-more.tsx`
- Modify: `frontend/src/app/(public)/search/page.tsx`
- Read: `frontend/src/components/forum/post-skeleton.tsx`
- Read: `frontend/src/components/forum/post-detail-skeleton.tsx`

**Interfaces:**
- Consumes: `EmptyState`, `ErrorState`, `InlineLoading`, specialized post skeletons, existing server-fetch helpers.
- Produces: Public pages that distinguish fetch failures from successful empty results and expose retry wherever the page is client-interactive.

- [ ] **Step 1: Identify silent fallback sites**

  For each page, replace `fallback: []` used to represent an unavailable request with an explicit result shape such as `{ data: [], error: ... }`, or use the page’s existing error boundary/data-fetch convention. Do not alter the API response shape.

- [ ] **Step 2: Add public route loading boundary**

  Create `frontend/src/app/(public)/loading.tsx` using `PageLoader` or a suitable existing post skeleton. Use Chinese text such as `正在加载页面...` only where visible text is needed.

- [ ] **Step 3: Migrate homepage and post states**

  Keep `PostListSkeleton`/`PostDetailSkeleton` for loading. Render `ErrorState` for failed primary fetches. Render `EmptyState` only for successful empty lists, with `/posts/new` CTA on the home/posts list. Preserve `notFound()` for a confirmed missing post.

- [ ] **Step 4: Migrate resources and load-more**

  Keep the existing feature-off state for disabled resources. Distinguish disabled, successful empty, and fetch error. In `resource-load-more.tsx`, replace `console.error`-only handling with inline `ErrorState` or a compact retry control while preserving existing resources.

- [ ] **Step 5: Migrate search states**

  Separate no query (`请输入搜索关键词`), successful no results (`没有找到匹配的结果`), loading, and request failure with retry. Never render no-results copy for a failed request.

- [ ] **Step 6: Run public checks**

  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 7: Commit public state migration**

  ```bash
  git add frontend/src/app/(public) frontend/src/components/forum/resource-load-more.tsx
  git commit -m "feat(frontend): improve public page async states"
  ```

---

### Task 3: Migrate Messages and Notifications

**Files:**
- Modify: `frontend/src/app/(public)/messages/page.tsx`
- Modify: `frontend/src/app/(public)/messages/[userId]/page.tsx`
- Modify: `frontend/src/app/(auth)/notifications/page.tsx`
- Read: `frontend/src/components/ui/error-boundary.tsx`
- Read: `frontend/src/lib/api/client.ts`

**Interfaces:**
- Consumes: `EmptyState`, `ErrorState`, `InlineLoading`, existing notification retry/filter patterns, client API helpers.
- Produces: Explicit client loading/error/empty states, retry actions, and preserved conversation data during refetch.

- [ ] **Step 1: Add messages-list state machine**

  Track `loading`, `error`, and `data` independently. Show `InlineLoading`/skeleton during initial fetch, `ErrorState` with retry on failure, and `EmptyState` only when the successful list is empty.

- [ ] **Step 2: Add conversation state machine**

  Add visible initial loading and fetch error with retry. Keep the existing send error separate from conversation-load error; a send failure must not replace the loaded conversation. Keep empty copy `开始一段对话` only for a successful empty history.

- [ ] **Step 3: Normalize notifications states**

  Preserve the existing filter-aware empty messages and retry behavior. Replace remaining generic loading/error copy with shared components where layout permits; action errors remain inline and do not erase notification rows.

- [ ] **Step 4: Run focused frontend checks**

  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 5: Commit messages/notifications**

  ```bash
  git add frontend/src/app/(public)/messages frontend/src/app/(auth)/notifications
  git commit -m "feat(frontend): improve message and notification states"
  ```

---

### Task 4: Standardize Admin List States

**Files:**
- Modify: `frontend/src/app/admin/posts/page.tsx`
- Modify: `frontend/src/app/admin/users/page.tsx`
- Modify: `frontend/src/app/admin/categories/page.tsx`
- Modify: `frontend/src/app/admin/resources/page.tsx` or `frontend/src/components/admin/resource-table.tsx`
- Modify: `frontend/src/app/admin/resources/moderation/page.tsx` or its table component
- Modify: `frontend/src/app/admin/notifications/page.tsx`
- Modify: `frontend/src/app/admin/content/moderation/page.tsx`
- Modify: `frontend/src/app/admin/content/reports/page.tsx` only where it lacks a retryable error/empty state
- Create: `frontend/src/app/admin/loading.tsx`

**Interfaces:**
- Consumes: Shared state components and existing admin API methods.
- Produces: Admin list pages with consistent loading, retryable error, empty, and refetch behavior.

- [ ] **Step 1: Add admin route loading boundary**

  Create `frontend/src/app/admin/loading.tsx` using `PageLoader` or a compact admin skeleton, with no English-only loading copy.

- [ ] **Step 2: Normalize initial fetch behavior**

  For each list, render loading before data, `ErrorState` with retry after failure, and `EmptyState` only after successful empty results. Add retry to admin users, notifications, categories, and moderation pages where current errors only render an Alert.

- [ ] **Step 3: Preserve rows during refetch**

  Do not set existing rows to `[]` before refresh. Track `refreshing` separately and show `InlineLoading` beside the table heading or refresh action. Keep current rows visible if a subsequent refresh fails.

- [ ] **Step 4: Normalize copy and filters**

  Use context-specific Chinese empty copy, e.g. `当前筛选下没有帖子。`, `暂无用户。`, `暂无分类。`, `暂无通知。`, `暂无待审批内容。`. Keep filter controls and pagination unchanged.

- [ ] **Step 5: Run admin checks**

  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 6: Commit admin state migration**

  ```bash
  git add frontend/src/app/admin frontend/src/components/admin
  git commit -m "feat(admin): standardize list async states"
  ```

---

### Task 5: Add Remaining Route Boundaries and Regression Tests

**Files:**
- Create: `frontend/src/app/(public)/posts/loading.tsx`
- Create: `frontend/src/app/(public)/resources/loading.tsx`
- Create: `frontend/src/app/(public)/search/loading.tsx`
- Create: `frontend/src/app/(public)/messages/loading.tsx`
- Modify or create: `frontend/src/app/(auth)/loading.tsx` only if needed to align copy
- Add tests: Existing frontend test location if present; otherwise add focused component tests only if test runner is configured.

**Interfaces:**
- Consumes: Existing `PageLoader`, specialized skeletons, shared state primitives.
- Produces: Route transitions with stable loading UI and regression coverage for key state distinctions.

- [ ] **Step 1: Add route loading files**

  Use the smallest suitable existing loader for each route group. Do not add duplicate full-screen implementations. Posts/resources may use their specialized skeleton; search/messages may use `InlineLoading` or `PageLoader`.

- [ ] **Step 2: Add tests for shared state semantics**

  If the frontend test runner exists, cover:
  - `EmptyState` renders CTA label and status role.
  - `ErrorState` invokes `onRetry`.
  - page-level failure does not render the empty-state copy.
  - load-more failure leaves existing rows visible.

  If no frontend runner is configured, document that limitation and rely on TypeScript/build plus Playwright/manual checks; do not add a new test framework.

- [ ] **Step 3: Run complete frontend checks**

  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 4: Commit route boundaries/tests**

  ```bash
  git add frontend/src/app frontend/src/components
  git commit -m "test(frontend): cover async state boundaries"
  ```

---

### Task 6: End-to-End Review and Verification

**Files:**
- Read/verify: all files changed by Tasks 1-5
- Modify: only if verification finds a concrete defect

**Interfaces:**
- Consumes: all shared state primitives, page migrations, and route boundaries.
- Produces: verified frontend async-state standardization with no backend changes.

- [ ] **Step 1: Run complete type/build checks**

  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 2: Run existing frontend tests**

  ```bash
  cd frontend
  npm test -- --runInBand
  ```
  If no `test` script exists, record that fact and run the configured Playwright command instead of inventing a command.

- [ ] **Step 3: Verify state scenarios manually or with Playwright**

  For each representative public/admin page verify:
  1. Normal response renders data.
  2. Successful empty response renders contextual empty state.
  3. Failed request renders Chinese error state with retry.
  4. Retry success replaces error with data.
  5. Refresh failure preserves existing rows.
  6. Load-more failure preserves existing rows and exposes retry.
  7. Mobile viewport has no overflow or overlapping state controls.

- [ ] **Step 4: Scan for regressions**

  ```bash
  git diff origin/master...HEAD --check
git status --short
  ```
  Confirm no backend files or unrelated feature work changed.

- [ ] **Step 5: Final commit review**

  ```bash
  git log --oneline origin/master..HEAD
  git diff --stat origin/master...HEAD
  ```
  Confirm each batch is independently understandable and all checks are recorded.
