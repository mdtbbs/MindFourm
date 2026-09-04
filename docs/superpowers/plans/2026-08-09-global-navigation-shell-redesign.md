# Global Navigation Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the non-admin MindFourm frontend shell so content/utility pages use a unified left-sidebar navigation shell, auth flow pages keep a lightweight layout, and mobile navigation shares the same data model as desktop.

**Architecture:** Split the current non-admin shell into two explicit layouts: a lightweight auth-flow layout and a content shell. Extract a shared navigation model from the existing top-navigation settings, forum sidebar quick links, and user utility entries, then render that model into a desktop sidebar and a mobile drawer while downgrading the header to a tools-only toolbar.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, existing `UnifiedHeader`, Zustand settings hooks, existing auth/settings contexts, lucide-react, Tailwind utility classes, shared CSS variables from `shared-styles`, Playwright/manual verification, `npx tsc --noEmit`, `npm run build`.

## Global Constraints

- Admin layout must remain untouched and must not be migrated into the new shell.
- `login / register / callback / accept-terms` must keep a lightweight flow layout and must not render the global sidebar.
- Content and utility pages under `(public)` and `(auth)` must converge on one unified content shell.
- The new shell must keep using backend-configurable `settings.top_navigation_items` as a primary navigation source.
- Desktop sidebar and mobile drawer must share one navigation model; do not maintain separate information architectures.
- Header must become a tools-only bar; do not keep desktop top-navigation as a second primary navigation system.
- Continue using existing theme tokens (`--bg`, `--bg-card`, `--bg-elevated`, `--text`, `--text-secondary`, `--text-muted`, `--border`, `--primary`, `--primary-soft`) and do not introduce undefined tokens such as `--bg-secondary` or `--bg-tertiary`.
- Page-level context sidebars (forum categories/tags, resource category tree, resource hot sidebar, LANLink tabs) must remain page-owned context, not be promoted back into global primary navigation.
- Feature flags must hide disabled navigation targets on both desktop and mobile.
- Anonymous users must see only anonymous-safe navigation entries; user-only items must be gated by auth state.
- Fix the current `md ~ lg` navigation gap so all non-desktop widths still have a usable menu path.
- Do not add a new dependency or a new frontend test framework in this plan.
- Every task must pass `cd frontend && npx tsc --noEmit` and `npm run build` before commit.

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/components/layout/site-shell.tsx` | Current non-admin shell; will either become the new content shell host or be reduced to a thin wrapper around it |
| `frontend/src/components/layout/auth-flow-shell.tsx` | New lightweight shell for login/register/callback/accept-terms |
| `frontend/src/components/layout/content-shell.tsx` | New unified content shell with desktop sidebar + toolbar + content area |
| `frontend/src/components/layout/content-sidebar.tsx` | Desktop primary navigation renderer |
| `frontend/src/components/layout/content-drawer.tsx` | Mobile drawer renderer using the same navigation model |
| `frontend/src/components/layout/content-toolbar.tsx` | Thin adapter for `UnifiedHeader` in tools-only mode |
| `frontend/src/components/layout/sidebar-user-panel.tsx` | Focused user identity/quick-actions block for the sidebar |
| `frontend/src/components/layout/sidebar-nav-groups.tsx` | Focused renderer for primary/group/personal navigation sections |
| `frontend/src/components/layout/mobile-nav-menu.tsx` | Existing mobile nav; retire or reduce once drawer is adopted |
| `frontend/src/components/layout/top-navigation-menu.tsx` | Existing desktop top nav; remove from shell or leave only if unused elsewhere |
| `frontend/src/lib/navigation/top-navigation.ts` | Existing parser/filter logic; extend toward unified model input |
| `frontend/src/lib/navigation/site-navigation.ts` | New navigation-model builder with auth-aware and feature-aware composition |
| `frontend/src/app/(public)/layout.tsx` | Route-group entry; stop routing every public page through the old generic shell |
| `frontend/src/app/(auth)/layout.tsx` | Route-group entry; stop routing every auth-group page through the old generic shell |
| `frontend/src/app/(auth)/login/layout.tsx` | Auth flow page boundary |
| `frontend/src/app/(auth)/register/layout.tsx` | Auth flow page boundary |
| `frontend/src/app/(auth)/callback/layout.tsx` | Auth flow page boundary |
| `frontend/src/app/(auth)/accept-terms/layout.tsx` | Auth flow page boundary |
| `frontend/src/components/forum/forum-content-layout.tsx` | Existing forum page wrapper; reduce to page-context layout rather than global-nav provider |
| `frontend/src/components/forum/sidebar.tsx` | Existing forum context sidebar; keep only page-context responsibilities |
| `frontend/src/app/(public)/page.tsx` | Home page; remove dependence on old forum sidebar as global nav |
| `frontend/src/app/(public)/categories/[id]/page.tsx` | Category page; same migration as home |
| `frontend/src/app/(public)/resources/[id]/page.tsx` | Resource detail page; remove experimental `layout/sidebar.tsx` usage |
| `frontend/src/components/layout/sidebar.tsx` | Experimental/legacy sidebar; delete or stop using after migration |
| `frontend/src/lib/shared/components/UnifiedHeader.tsx` | Shared header component; keep but use as a tools-only bar |

---

### Task 1: Build the Unified Navigation Model

**Files:**
- Create: `frontend/src/lib/navigation/site-navigation.ts`
- Modify: `frontend/src/lib/navigation/top-navigation.ts`
- Read: `frontend/src/components/forum/sidebar.tsx`
- Read: `frontend/src/components/layout/mobile-nav-menu.tsx`
- Read: `frontend/src/components/layout/site-shell.tsx`
- Test: `cd frontend && npx tsc --noEmit && npm run build`

**Interfaces:**
- Consumes:
  ```ts
  type TopNavigationItem =
    | { type: 'link'; label: string; href: string; newTab?: boolean }
    | { type: 'group'; label: string; items: { label: string; href: string; newTab?: boolean }[] };
  ```
  and settings/auth inputs already available in the shell layer.
- Produces:
  ```ts
  export type SiteNavLink = {
    label: string;
    href: string;
    newTab?: boolean;
    icon?: string;
    requiresAuth?: boolean;
  };

  export type SiteNavGroup = {
    label: string;
    items: SiteNavLink[];
    collapsible?: boolean;
    defaultExpanded?: boolean;
  };

  export type SidebarQuickAction = {
    label: string;
    href?: string;
    action?: 'login' | 'register';
    requiresAuth?: boolean;
    variant: 'primary' | 'secondary';
  };

  export type SiteNavigationModel = {
    primaryItems: SiteNavLink[];
    groups: SiteNavGroup[];
    personalItems: SiteNavLink[];
    quickActions: SidebarQuickAction[];
  };

  export type SiteNavigationContext = {
    settings: Record<string, string>;
    isAuthenticated: boolean;
    userRole?: string;
  };

  export function buildSiteNavigationModel(context: SiteNavigationContext): SiteNavigationModel;
  ```

- [ ] **Step 1: Add a focused navigation-model file**

  Create `frontend/src/lib/navigation/site-navigation.ts` and define the `SiteNavLink`, `SiteNavGroup`, `SidebarQuickAction`, `SiteNavigationModel`, and `SiteNavigationContext` types shown above. Keep this file pure and framework-free: it should not import React, hooks, or UI components.

- [ ] **Step 2: Reuse configured top navigation as model input**

  In `buildSiteNavigationModel(context)`, call the existing `parseTopNavigationItems()` and `filterTopNavigationItemsBySettings()` logic to derive the configured navigation base. Map top-level links into `primaryItems`. Map configured groups into `groups` while preserving labels and child links.

- [ ] **Step 3: Add fixed user/utility navigation**

  Still inside `buildSiteNavigationModel(context)`, append a fixed authenticated section for utility pages:
  ```ts
  const authenticatedPersonalItems: SiteNavLink[] = [
    { label: '通知', href: '/notifications', icon: 'bell', requiresAuth: true },
    { label: '消息', href: '/messages', icon: 'mail', requiresAuth: true },
    { label: '好友', href: '/friends', icon: 'users', requiresAuth: true },
    { label: '书签', href: '/bookmarks', icon: 'bookmark', requiresAuth: true },
    { label: '设置', href: '/settings', icon: 'settings', requiresAuth: true },
  ];
  ```
  Filter these by `context.isAuthenticated` so anonymous users do not see them.

- [ ] **Step 4: Add auth-aware quick actions**

  Populate `quickActions` with auth-aware actions. Use this exact shape:
  ```ts
  const authenticatedQuickActions: SidebarQuickAction[] = [
    { label: '发帖', href: '/posts/new', requiresAuth: true, variant: 'primary' },
    { label: '提交资源', href: '/resources/submit', requiresAuth: true, variant: 'secondary' },
  ];

  const anonymousQuickActions: SidebarQuickAction[] = [
    { label: '登录', action: 'login', variant: 'primary' },
    { label: '注册', action: 'register', variant: 'secondary' },
  ];
  ```
  Return one set or the other based on `context.isAuthenticated`.

- [ ] **Step 5: Preserve feature-flag filtering for all nav outputs**

  When mapping configured links and fixed links, hide disabled feature pages (`/resources`, `/servers`, `/groups`, `/leaderboard`, `/shop`, `/lanlink`) using the same feature-setting behavior already established in `top-navigation.ts`. Extend the helper layer there if needed, but keep `site-navigation.ts` as the place that produces the final filtered model.

- [ ] **Step 6: Run focused frontend checks**

  Run:
  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 7: Commit the navigation model**

  ```bash
  git add frontend/src/lib/navigation/site-navigation.ts frontend/src/lib/navigation/top-navigation.ts
  git commit -m "feat(frontend): add unified site navigation model"
  ```

---

### Task 2: Build the New Content Shell Components

**Files:**
- Create: `frontend/src/components/layout/content-shell.tsx`
- Create: `frontend/src/components/layout/content-sidebar.tsx`
- Create: `frontend/src/components/layout/content-drawer.tsx`
- Create: `frontend/src/components/layout/content-toolbar.tsx`
- Create: `frontend/src/components/layout/sidebar-nav-groups.tsx`
- Create: `frontend/src/components/layout/sidebar-user-panel.tsx`
- Modify: `frontend/src/components/layout/site-shell.tsx`
- Read: `frontend/src/lib/shared/components/UnifiedHeader.tsx`
- Read: `frontend/src/components/forum/footer.tsx`
- Read: `frontend/src/components/forum/announcement-banner.tsx`
- Test: `cd frontend && npx tsc --noEmit && npm run build`

**Interfaces:**
- Consumes:
  ```ts
  import { SiteNavigationModel } from '@/lib/navigation/site-navigation';
  ```
  plus existing auth/settings hooks and footer/banner components.
- Produces:
  ```ts
  export default function ContentShell({ children }: { children: React.ReactNode }): JSX.Element;
  export function ContentSidebar(props: {
    navigation: SiteNavigationModel;
    currentPathname: string;
    siteName: string;
    logoUrl?: string;
    userName?: string;
    userMeta?: string;
    onLogin: () => void;
    onRegister: () => void;
  }): JSX.Element;
  export function ContentDrawer(props: {
    open: boolean;
    navigation: SiteNavigationModel;
    currentPathname: string;
    onClose: () => void;
    onLogin: () => void;
    onRegister: () => void;
  }): JSX.Element | null;
  export function ContentToolbar(props: {
    unreadMessageCount: number;
    unreadFriendRequestCount: number;
    onLogin: () => void;
    onRegister: () => void;
    onLogout?: () => void;
    onSearch: (query: string) => void;
    onOpenDrawer: () => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Create focused shell component files**

  Add the six new layout files listed above. Keep each file focused:
  - `content-shell.tsx`: shell composition and state
  - `content-sidebar.tsx`: desktop left rail
  - `content-drawer.tsx`: mobile overlay/drawer
  - `content-toolbar.tsx`: adapter around `UnifiedHeader`
  - `sidebar-nav-groups.tsx`: shared nav-section renderer
  - `sidebar-user-panel.tsx`: user panel + quick actions block

- [ ] **Step 2: Move reusable shell logic out of the old SiteShell**

  In `content-shell.tsx`, copy or extract the reusable logic from `site-shell.tsx` for:
  - auth/settings access
  - unread message count state
  - unread friend request count state
  - SSE refresh on `message` and `friend_request`
  - MindAuth login/register URL creation
  - site search routing

  Keep this logic behaviorally identical unless the new shell requires a strictly local rename.

- [ ] **Step 3: Render desktop sidebar and mobile drawer from the shared model**

  In `content-shell.tsx`, call `buildSiteNavigationModel({ settings, isAuthenticated, userRole: user?.role })`. Pass the returned model to both `ContentSidebar` and `ContentDrawer`. Use `usePathname()` in the shell or child components so active-item highlighting is based on the current route.

- [ ] **Step 4: Downgrade the header into a tools-only toolbar**

  In `content-toolbar.tsx`, render `UnifiedHeader` without `topNavigationSlot`. Keep:
  - `showSearch`
  - `showMessages`
  - `showNotifications`
  - `showFriends`
  - `showMobileMenu`

  Do **not** pass `TopNavigationMenu`. Do **not** leave desktop primary navigation in the header. Keep notification dropdown support if it still fits naturally.

- [ ] **Step 5: Implement drawer behavior correctly**

  In `content-drawer.tsx`, lock `document.body.style.overflow = 'hidden'` while open and restore it on close/unmount. Close the drawer after any internal navigation click. Ensure the drawer is available on all non-desktop widths so the old `md ~ lg` nav gap disappears.

- [ ] **Step 6: Make the old SiteShell a compatibility wrapper**

  Update `frontend/src/components/layout/site-shell.tsx` to either re-export `ContentShell` or wrap it directly:
  ```ts
  import ContentShell from '@/components/layout/content-shell';

  export default function SiteShell({ children }: { children: React.ReactNode }) {
    return <ContentShell>{children}</ContentShell>;
  }
  ```
  Keep this adapter only to minimize route-layout churn during migration.

- [ ] **Step 7: Run shell checks**

  Run:
  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 8: Commit the new shell**

  ```bash
  git add frontend/src/components/layout frontend/src/components/forum/footer.tsx frontend/src/components/forum/announcement-banner.tsx
  git commit -m "feat(frontend): add unified content shell"
  ```

---

### Task 3: Split Auth Flow Pages Off the Main Content Shell

**Files:**
- Create: `frontend/src/components/layout/auth-flow-shell.tsx`
- Modify: `frontend/src/app/(auth)/layout.tsx`
- Create: `frontend/src/app/(auth)/login/layout.tsx`
- Create: `frontend/src/app/(auth)/register/layout.tsx`
- Create: `frontend/src/app/(auth)/callback/layout.tsx`
- Create: `frontend/src/app/(auth)/accept-terms/layout.tsx`
- Read: `frontend/src/app/(auth)/login/page.tsx`
- Read: `frontend/src/app/(auth)/register/page.tsx`
- Read: `frontend/src/app/(auth)/callback/page.tsx`
- Read: `frontend/src/app/(auth)/accept-terms/page.tsx`
- Test: `cd frontend && npx tsc --noEmit && npm run build`

**Interfaces:**
- Consumes: existing auth flow pages without changing their page-level business logic.
- Produces:
  ```ts
  export default function AuthFlowShell({ children }: { children: React.ReactNode }): JSX.Element;
  ```
  and route-level layout files that opt flow pages into that shell.

- [ ] **Step 1: Create a lightweight auth flow shell**

  Add `frontend/src/components/layout/auth-flow-shell.tsx` with a centered, lightweight layout. It should show minimal site branding and a content container, but no left sidebar, no mobile drawer, and no tools-heavy toolbar.

- [ ] **Step 2: Keep the `(auth)` group default on the content shell**

  Leave `frontend/src/app/(auth)/layout.tsx` pointing to the general content shell adapter (`SiteShell`) so content/utility pages like `/notifications`, `/friends`, `/settings`, `/resources/my`, `/lanlink`, and `/users/me/edit` still receive the main site shell by default.

- [ ] **Step 3: Override only the flow routes with nested layouts**

  Create these four files:
  ```tsx
  // frontend/src/app/(auth)/login/layout.tsx
  import AuthFlowShell from '@/components/layout/auth-flow-shell';

  export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return <AuthFlowShell>{children}</AuthFlowShell>;
  }
  ```
  Repeat the same pattern for `register`, `callback`, and `accept-terms`.

- [ ] **Step 4: Verify flow pages are still functional inside the light shell**

  Do not rewrite the page business logic. Only make minimal spacing/container tweaks if the pages visually depend on the old full shell. If a page relied on header/footer spacing, fix that inside `auth-flow-shell.tsx` rather than adding per-page hacks.

- [ ] **Step 5: Run auth-shell checks**

  Run:
  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 6: Commit auth flow shell split**

  ```bash
  git add frontend/src/components/layout/auth-flow-shell.tsx frontend/src/app/(auth)/layout.tsx frontend/src/app/(auth)/login/layout.tsx frontend/src/app/(auth)/register/layout.tsx frontend/src/app/(auth)/callback/layout.tsx frontend/src/app/(auth)/accept-terms/layout.tsx
  git commit -m "feat(frontend): split auth flow from content shell"
  ```

---

### Task 4: Migrate Forum Home and Category Pages Away from Global Sidebar Duty

**Files:**
- Modify: `frontend/src/components/forum/forum-content-layout.tsx`
- Modify: `frontend/src/components/forum/sidebar.tsx`
- Modify: `frontend/src/app/(public)/page.tsx`
- Modify: `frontend/src/app/(public)/categories/[id]/page.tsx`
- Read: `frontend/src/components/forum/latest-posts-list.tsx`
- Read: `frontend/src/components/forum/post-card.tsx`
- Test: `cd frontend && npx tsc --noEmit && npm run build`

**Interfaces:**
- Consumes: `ContentShell` as the outer shell and existing forum page data-fetching.
- Produces: forum pages where the old sidebar is purely page-context navigation and no longer acts as the site’s main navigation.

- [ ] **Step 1: Rename the mental role of forum-content-layout**

  Keep `forum-content-layout.tsx` only if it still provides value as a forum-page context layout. Update it so its left column is clearly optional page-context UI rather than the site’s primary nav provider. If the file becomes a thin wrapper, keep it small; do not add new global-nav logic here.

- [ ] **Step 2: Strip global-nav expectations out of forum/sidebar.tsx**

  Keep only the context pieces that belong to forum pages:
  - category list
  - hot tags
  - forum-specific quick links if still useful as page context

  Do not add user utility entries, auth actions, or top-level site navigation to this file.

- [ ] **Step 3: Verify the home page still reads correctly under the new shell**

  In `frontend/src/app/(public)/page.tsx`, keep the hero/stats/latest-posts structure intact. Only adjust container widths, spacing, or `ForumContentLayout` usage if the new outer shell causes double sidebars, crushed spacing, or redundant nav hierarchy.

- [ ] **Step 4: Verify the category page still reads correctly under the new shell**

  In `frontend/src/app/(public)/categories/[id]/page.tsx`, keep category heading and post-card listing behavior intact. Make only the minimum layout changes needed to avoid double-navigation feel or broken widths.

- [ ] **Step 5: Run forum-page checks**

  Run:
  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 6: Commit forum page migration**

  ```bash
  git add frontend/src/components/forum/forum-content-layout.tsx frontend/src/components/forum/sidebar.tsx frontend/src/app/(public)/page.tsx frontend/src/app/(public)/categories/[id]/page.tsx
  git commit -m "feat(frontend): separate forum context sidebar from site nav"
  ```

---

### Task 5: Remove the Experimental Resource Detail Sidebar and Normalize Resource Pages Under the New Shell

**Files:**
- Modify: `frontend/src/app/(public)/resources/[id]/page.tsx`
- Modify: `frontend/src/app/(public)/resources/page.tsx`
- Modify: `frontend/src/components/forum/resource-detail.tsx` only if spacing or shell integration requires it
- Delete or stop importing: `frontend/src/components/layout/sidebar.tsx`
- Read: `frontend/src/components/forum/resource-category-tree.tsx`
- Read: `frontend/src/components/forum/resource-sidebar.tsx`
- Test: `cd frontend && npx tsc --noEmit && npm run build`

**Interfaces:**
- Consumes: `ContentShell` as the outer shell and existing resource page components.
- Produces: resource list/detail pages where page-local context panels remain, but the experimental layout sidebar is no longer used.

- [ ] **Step 1: Remove the direct experimental sidebar import from the resource detail page**

  In `frontend/src/app/(public)/resources/[id]/page.tsx`, remove:
  ```ts
  import Sidebar from '@/components/layout/sidebar';
  ```
  and eliminate the extra outer `<div className="flex min-h-screen">` + `<Sidebar />` wrapper so the page relies on the global content shell for its primary navigation.

- [ ] **Step 2: Keep resource detail page context local to the page**

  Preserve the page’s own breadcrumb, `ResourceDetail`, comment thread, tabs, and right-side info panels. If the page needs a local two-column layout inside the shell, keep that layout within the page content area instead of reinstating a global-looking left nav.

- [ ] **Step 3: Verify the resource list page still makes sense inside the content shell**

  In `frontend/src/app/(public)/resources/page.tsx`, keep the resource page’s own three-column content layout (`category tree | main list | hot sidebar`) if it still fits visually. Only adjust widths/spacing/sticky offsets if the new outer shell makes the current grid too tight or causes sticky overlap with the new toolbar.

- [ ] **Step 4: Retire the experimental sidebar file deliberately**

  If `frontend/src/components/layout/sidebar.tsx` has no remaining valid imports after Step 1, delete it. If you prefer a softer removal, leave the file only temporarily while ensuring no page imports it. Do not copy any of its hardcoded brand/user/route logic into the new shell.

- [ ] **Step 5: Run resource-page checks**

  Run:
  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 6: Commit resource shell migration**

  ```bash
  git add frontend/src/app/(public)/resources/page.tsx frontend/src/app/(public)/resources/[id]/page.tsx frontend/src/components/forum/resource-detail.tsx frontend/src/components/layout/sidebar.tsx
  git commit -m "feat(frontend): align resource pages with content shell"
  ```

---

### Task 6: Finalize Responsive Behavior and Retire Redundant Nav Renderers

**Files:**
- Modify: `frontend/src/components/layout/content-drawer.tsx`
- Modify: `frontend/src/components/layout/content-toolbar.tsx`
- Modify or delete: `frontend/src/components/layout/mobile-nav-menu.tsx`
- Modify or delete: `frontend/src/components/layout/top-navigation-menu.tsx`
- Modify: `frontend/src/lib/shared/components/UnifiedHeader.tsx` only if toolbar-only mode needs a safe prop/markup adjustment
- Test: `cd frontend && npx tsc --noEmit && npm run build`

**Interfaces:**
- Consumes: the new shell from Tasks 1-5.
- Produces: a single responsive navigation system with no tablet-width gap and no redundant desktop-primary-nav renderer.

- [ ] **Step 1: Verify non-desktop widths all have a menu path**

  Ensure the content toolbar’s mobile-menu trigger stays visible across all widths below the desktop threshold used for the persistent sidebar. If necessary, adjust `UnifiedHeader` or the toolbar wrapper so the trigger does not disappear at `md` while the sidebar is still absent.

- [ ] **Step 2: Remove old desktop top-navigation rendering from the main shell path**

  Ensure `TopNavigationMenu` is no longer used by the new content shell. If the file is now unused project-wide, delete it. If it remains useful elsewhere, keep it but make sure it is no longer part of the primary site shell.

- [ ] **Step 3: Remove the old mobile-nav-menu from the main shell path**

  Ensure `MobileNavMenu` is no longer used by the new content shell. Delete the file if it becomes unused; otherwise leave it only where explicitly still needed outside the main shell. Do not keep it as a parallel global mobile nav.

- [ ] **Step 4: Keep header changes minimal and safe**

  Only edit `UnifiedHeader.tsx` if the tools-only usage exposes a concrete issue (for example, spacing, hidden menu button breakpoints, or a slot assumption). Prefer adapting via `content-toolbar.tsx` first. If you do edit the header, keep the component backwards-compatible with existing admin/shared consumers.

- [ ] **Step 5: Run final frontend checks**

  Run:
  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 6: Commit responsive/nav cleanup**

  ```bash
  git add frontend/src/components/layout frontend/src/lib/shared/components/UnifiedHeader.tsx
  git commit -m "refactor(frontend): unify responsive site navigation"
  ```

---

### Task 7: Manual Verification, Playwright Sanity Pass, and Cleanup

**Files:**
- Read/verify: all files changed by Tasks 1-6
- Modify: only if verification finds a concrete defect

**Interfaces:**
- Consumes: all new shell, nav-model, route-layout, and page migration work.
- Produces: a verified shell migration with no broken routes, double-nav regressions, or responsive dead zones.

- [ ] **Step 1: Run full frontend static verification**

  Run:
  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 2: Run a focused browser sanity pass**

  Start the frontend in the project’s known-good local mode and manually verify these routes in desktop and mobile widths:
  - `/`
  - `/categories/1` or another real category ID
  - `/posts/<real-id>`
  - `/resources`
  - `/resources/<real-id>`
  - `/notifications`
  - `/messages`
  - `/friends`
  - `/settings`
  - `/login`
  - `/register`

  Confirm:
  - flow pages do not show the global sidebar
  - content pages do show the global sidebar
  - drawer opens/closes correctly on mobile/tablet widths
  - no duplicate top-level nav appears
  - no blank navigation state appears at tablet widths

- [ ] **Step 3: Run Playwright only if the current suite already covers these routes without extra framework work**

  If there are existing stable Playwright specs for shell/navigation flows, run the narrowest relevant subset. If not, do not invent a new framework or large suite here; document that manual verification plus type/build checks are the acceptance path.

- [ ] **Step 4: Remove dead imports and dead files found during verification**

  Delete any now-unused imports/components left behind by the shell migration, especially old sidebar/mobile-nav/top-nav artifacts that are no longer referenced. Keep this cleanup limited to dead code directly created by the migration.

- [ ] **Step 5: Commit verification fixes and cleanup**

  ```bash
  git add frontend/src
  git commit -m "chore(frontend): finalize navigation shell migration"
  ```

## Self-Review

### Spec coverage

- Shell split between flow pages and content pages: covered by Tasks 2 and 3.
- Reuse backend-configurable `top_navigation_items`: covered by Task 1.
- Desktop sidebar as sole primary nav and header as tools-only bar: covered by Tasks 2 and 6.
- Mobile drawer sharing same nav data model and fixing `md ~ lg` gap: covered by Tasks 2 and 6.
- Keep page context sidebars local rather than global: covered by Tasks 4 and 5.
- Remove experimental resource detail sidebar: covered by Task 5.
- Leave admin untouched: enforced in global constraints and preserved across all tasks.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task includes concrete files, concrete interfaces, explicit commands, and a commit step.
- Manual verification is explicit because the frontend does not already expose a dedicated unit-test runner in package scripts; the plan does not pretend one exists.

### Type consistency

- `buildSiteNavigationModel(context)` is introduced in Task 1 and consumed consistently in Task 2.
- `ContentShell`, `ContentSidebar`, `ContentDrawer`, and `ContentToolbar` names are introduced once and reused consistently later.
- The distinction between global navigation (`SiteNavigationModel`) and page context panels is maintained consistently across Tasks 4 and 5.
