# 资源社区中心实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有资源上传、外链、MFL、分类、版本、审核、评分和后台能力上，增量实现可搜索、可维护、可协作的社区资源中心。

**Architecture:** 保留现有 `Resource`、`ResourceVersion`、`ResourceCategory`、`ResourceRating` 和资源控制器契约，按子域增加标签、兼容版本、运行环境、评论、收藏、关注、失效报告、维护者、转让、统计和历史记录。资源主体只展示当前推荐版本摘要；版本审核独立进行，下载权限独立执行“公开、审核通过、未撤回、未确认失效”的检查。前端复用现有资源详情、表单、列表、后台表格、认证、手机号验证、通知、图片上传和状态组件。

**Tech Stack:** NestJS 10, TypeORM 0.3, MySQL, Redis/ioredis, Next.js App Router, React 18, TypeScript, Tailwind, existing `sanitize-html` Markdown pipeline, existing notification/report/rate-limit/permission systems, Playwright and existing unit tests.

## Global Constraints

- 不修改 MindAuth、MindFileList API、后端 response envelope 或数据库之外的外部服务。
- 不引入新依赖；沿用现有 CSS variables、图标、Markdown 清理、图片上传、认证、手机号验证、通知、举报和权限基础设施。
- 资源作者/维护者可以查看有权限的资源信息，但不能通过下载接口或外链绕过公开审核边界。
- 下载或打开外链必须同时满足：资源公开、版本审核通过、版本未撤回、版本未确认失效、资源未归档。
- 新版本独立审核；新版本审核期间旧的已通过版本继续可下载；新版本审核通过后自动成为当前推荐版本。
- 资源只能关联父子分类树中的末级分类；父分类只用于聚合、导航和筛选。
- 版本兼容信息、运行环境和版本文件/外链是版本提交必填项；更新日志、依赖、已知问题和兼容性说明可选。
- 同一筛选项内使用 OR，不同筛选项之间使用 AND；版本范围筛选必须匹配包含所选版本的范围。
- 评分、评论、回复、点赞、点踩和失效报告提交均遵守已确认的认证、手机号验证和限流规则。
- 评论 Markdown 原文最多 300 个字符；评论图片只能使用现有站内图片上传地址；所有渲染内容必须经过现有 HTML 清理流程。
- 删除评论保留节点和子回复，显示“该评论已删除”或“该回复已删除”，删除节点禁止新回复和互动。
- 失效报告独立于 `reports`；评论举报复用 `reports` 和 `report_auto_hide_threshold`。
- 用户无独立下载历史页面；下载明细永久保留必要的用户、资源、版本、时间、来源和结果信息，不保存 IP、设备指纹或 Cookie。
- 每个任务完成后运行对应后端/前端类型检查、测试和构建，再提交独立 commit；不得回滚已有用户改动。

## File Structure

| Area | Responsibility |
|------|----------------|
| `src/entities/resource*.entity.ts` | 资源主体、版本、评分及新增资源子域实体关系 |
| `src/modules/resources/` | 资源访问边界、版本生命周期、标签/兼容信息、协作、失效、统计 API |
| `src/modules/resource-comments/` | 评论树、Markdown 内容、互动和评论管理 |
| `src/modules/resource-social/` | 收藏、关注和资源更新订阅 |
| `src/modules/resource-reports/` | 独立资源/版本失效报告状态机 |
| `src/database/migrations/` | 可回滚、幂等的增量 schema 和索引 |
| `frontend/src/components/forum/resource-*` | 资源详情、表单、列表筛选、版本、评论和依赖 UI |
| `frontend/src/app/admin/resources*` | 资源、版本、标签、兼容选项、失效报告和评论管理 |
| `frontend/src/lib/api/client.ts` | 所有新增资源 API 的类型安全客户端方法 |

---

### Task 1: 修复资源访问边界和现有数据契约

**Files:**
- Modify: `src/modules/resources/resources.controller.ts`
- Modify: `src/modules/resources/resources.service.ts`
- Modify: `src/modules/resources/resource-versions.service.ts`
- Modify: `src/modules/resources/dto/query-resources.dto.ts`
- Modify: `frontend/src/components/forum/resource-detail.tsx`
- Modify: `frontend/src/app/(public)/users/[id]/page.tsx`
- Modify: `src/modules/search/search.service.ts`
- Test: `src/modules/resources/resources.service.spec.ts`
- Test: resource controller/authorization test location already used by the backend

**Interfaces:**
- Produces `ResourcesService.assertResourceDownloadable(resource, version?)` as a separate policy from detail visibility.
- Produces validated version download lookup that rejects pending, rejected, withdrawn, archived and confirmed-invalid versions.
- Produces cursor parsing that preserves decimal `rating_average` values and rejects malformed cursors with a client error.
- Produces a cursor-compatible public profile resource response consumed by `users/[id]/page.tsx`.

- [ ] **Step 1: Add failing authorization and cursor tests**

  Cover these cases with repository/service mocks: an owner cannot download a pending or private resource; a moderator cannot download a rejected resource through the public download policy; a public approved resource can download; a malformed cursor is rejected; a `rating_average` cursor keeps `4.75` instead of truncating to `4`.

- [ ] **Step 2: Separate detail visibility from download visibility**

  Keep owner/staff detail visibility where needed for status/rejection views, but make `download` and external/MFL redirect call a strict approved-public-version policy. Apply the same policy to version downloads and ensure the download counter increments only after the target is validated and served/redirected.

- [ ] **Step 3: Validate version and resource-type transitions**

  Reject external resources without a safe `external_url`, upload resources without a local/MFL file, and file versions on external resources. Ensure changing a download payload creates a pending review state and does not expose the new payload before approval.

- [ ] **Step 4: Repair pagination and search contracts**

  Change the public profile client to send/read `cursor`, `next_cursor`, and `has_more`. Validate admin/public status values through DTO/service checks. Return the fields needed by `ResourceCard` from resource search, and remove duplicate search requests in the public search page.

- [ ] **Step 5: Run checks and commit**

  ```bash
  npx tsc --noEmit -p tsconfig.json
  npm test -- --runInBand
  cd frontend
  npx tsc --noEmit
  npm run build
  ```

  Commit as `fix(resources): enforce approved download boundaries`.

---

### Task 2: Add resource metadata, tags, compatibility options, previews, and history

**Files:**
- Create: `src/entities/resource-tag.entity.ts`
- Create: `src/entities/resource-tag-link.entity.ts`
- Create: `src/entities/resource-compatibility-version.entity.ts`
- Create: `src/entities/resource-runtime.entity.ts`
- Create: `src/entities/resource-change.entity.ts`
- Create: `src/modules/resources/dto/resource-metadata.dto.ts`
- Create: `src/modules/resources/dto/resource-option.dto.ts`
- Create: `src/modules/resources/resource-metadata.service.ts`
- Create: `src/database/migrations/1720000023000-AddResourceCommunityMetadata.ts`
- Modify: `src/entities/resource.entity.ts`
- Modify: `src/entities/resource-version.entity.ts`
- Modify: `src/entities/index.ts`
- Modify: `src/database/migrations/index.ts`
- Modify: `src/modules/resources/resources.module.ts`
- Modify: `src/modules/resources/resources.controller.ts`
- Modify: `src/modules/resources/resources.service.ts`
- Modify: `frontend/src/lib/api/client.ts`
- Modify: `frontend/src/components/forum/resource-submit-form.tsx`
- Modify: `frontend/src/components/forum/resource-edit-form.tsx`
- Modify: `frontend/src/components/forum/resource-detail.tsx`
- Modify: `frontend/src/components/forum/resource-card.tsx`
- Create: `frontend/src/components/forum/resource-tag-input.tsx`
- Create: `frontend/src/components/forum/resource-preview-gallery.tsx`
- Create: `frontend/src/app/admin/resources/options/page.tsx`
- Create: `frontend/src/app/admin/resources/tags/page.tsx`
- Test: `src/modules/resources/resource-metadata.service.spec.ts`

**Interfaces:**
- Resource metadata accepts `wiki_url`, normalized tags, preview image URLs, and current-recommended-version summary.
- Admin option API manages ordered active/inactive Mindustry versions and runtime environments; historical selections remain readable.
- Resource history API returns field-level before/after changes, actor and timestamp with pagination.

- [ ] **Step 1: Add schema and migration**

  Add nullable Wiki and maintenance fields to resources, version selection fields to resources/resource_versions, normalized tag tables and links, preview image ordering records, option tables, and resource change history. Add foreign keys and indexes for resource, version, tag, active status and history time. Make migration safe for existing installations and backfill current `resource_type`/`version` data without inventing compatibility values.

- [ ] **Step 2: Implement metadata validation and normalization**

  Enforce safe `http`/`https` Wiki URLs,末级分类-only assignment, tag whitespace splitting, Unicode-safe length limits, duplicate removal, and active option selection for new submissions. Preserve inactive options in historical records. Record field-level history for ordinary metadata changes.

- [ ] **Step 3: Implement admin-managed version/runtime options and tag tools**

  Add admin CRUD for ordered options and tag list/rename/merge/deactivate/block. Merges must move links transactionally and deduplicate; blocked tags are excluded from public search; tag operations write audit entries and do not send user notifications.

- [ ] **Step 4: Implement preview image storage and gallery**

  Reuse the existing image upload endpoint and only persist site-hosted URLs. Add owner/maintainer add/reorder/delete operations, enforce the resource-level maximum, and derive the first ordered image as the cover.

- [ ] **Step 5: Integrate forms, detail, cards, filters, and history**

  Add metadata controls to submit/edit forms, show category path, tags, Wiki, current compatibility/runtime summary, cover, gallery and collapsible history. Preserve existing resource load/error/empty states and keep mobile image content within bounds.

- [ ] **Step 6: Run checks and commit**

  ```bash
  npx tsc --noEmit -p tsconfig.json
  npm test -- --runInBand
  cd frontend
  npx tsc --noEmit
  npm run build
  ```

  Commit as `feat(resources): add community metadata and history`.

---

### Task 3: Implement version lifecycle, dependencies, withdrawal, and recommendation switching

**Files:**
- Create: `src/entities/resource-version-compatibility.entity.ts`
- Create: `src/entities/resource-version-runtime.entity.ts`
- Create: `src/entities/resource-version-dependency.entity.ts`
- Create: `src/entities/resource-version-audit.entity.ts`
- Create: `src/modules/resources/dto/create-resource-version.dto.ts`
- Create: `src/modules/resources/dto/withdraw-resource-version.dto.ts`
- Create: `src/modules/resources/resource-version-policy.service.ts`
- Create: `src/database/migrations/1720000024000-AddResourceVersionLifecycle.ts`
- Modify: `src/modules/resources/resource-versions.service.ts`
- Modify: `src/modules/resources/resources.controller.ts`
- Modify: `src/modules/resources/resources.service.ts`
- Modify: `frontend/src/lib/api/client.ts`
- Modify: `frontend/src/components/forum/resource-detail.tsx`
- Create: `frontend/src/components/forum/resource-version-form.tsx`
- Create: `frontend/src/components/forum/resource-dependencies.tsx`
- Create: `frontend/src/app/admin/resources/versions/page.tsx`
- Test: `src/modules/resources/resource-versions.service.spec.ts`
- Test: `src/modules/resources/resource-version-policy.service.spec.ts`

**Interfaces:**
- `ResourceVersionService.create(dto, file, actor)` requires version, compatibility selections, runtime selections and a valid file/external payload.
- `ResourceVersionPolicyService.canManage(resource, actor)` allows owner, current maintainer, category moderator with resource permission, or admin according to the action.
- Direct dependency endpoints return only the current version’s direct prerequisites and direct dependents, paginated and collapsed by default in the UI.

- [ ] **Step 1: Add failing lifecycle tests**

  Test required compatibility/runtime fields, external-resource file-version rejection, maintainer submission, duplicate versions, pending version preserving the old recommendation, approval switching recommendation, withdrawal fallback, admin-only restore-to-pending, and direct dependency cycle rejection.

- [ ] **Step 2: Add version schema and validated DTO flow**

  Replace the unvalidated multipart body with an explicit DTO/pipe path. Store compatibility selections, runtime selections, optional changelog/dependencies/issues/compatibility notes, audit reason and status transitions. Keep old resource fields readable for legacy resources.

- [ ] **Step 3: Implement approval and recommendation transaction**

  On approval, transactionally mark the version approved, withdraw any prior recommendation flag, update the resource’s current-version summary, and preserve all older approved versions. On withdrawal or confirmed invalidation, select the newest remaining approved non-withdrawn version; if none exists, leave the resource visible but non-downloadable.

- [ ] **Step 4: Implement dependencies and collapsed direct relations**

  Allow a version to reference existing resources with a free-text version requirement or a pure-text dependency. Reject self and indirect cycles. Add separate lazy endpoints for prerequisites and direct dependents; do not recursively return dependency trees.

- [ ] **Step 5: Add version management UI and audit history**

  Show version history, current recommendation, compatibility, runtime, optional changelog, dependencies and withdrawal state. Add owner/maintainer submit/edit/withdraw controls, moderator/admin review controls, and collapsed dependency sections with local retry states.

- [ ] **Step 6: Run checks and commit**

  ```bash
  npx tsc --noEmit -p tsconfig.json
  npm test -- --runInBand
  cd frontend
  npx tsc --noEmit
  npm run build
  ```

  Commit as `feat(resources): implement independent version lifecycle`.

---

### Task 4: Add ratings, comments, replies, reactions, reports, and deep links

**Files:**
- Create: `src/entities/resource-comment.entity.ts`
- Create: `src/entities/resource-comment-reaction.entity.ts`
- Create: `src/modules/resource-comments/resource-comments.module.ts`
- Create: `src/modules/resource-comments/resource-comments.controller.ts`
- Create: `src/modules/resource-comments/resource-comments.service.ts`
- Create: `src/modules/resource-comments/dto/create-resource-comment.dto.ts`
- Create: `src/modules/resource-comments/dto/query-resource-comments.dto.ts`
- Create: `src/database/migrations/1720000025000-CreateResourceComments.ts`
- Modify: `src/modules/resources/resources.service.ts`
- Modify: `src/modules/resources/resources.controller.ts`
- Modify: `src/modules/reports/reports.service.ts`
- Modify: `src/modules/reports/reports.controller.ts`
- Modify: `src/common/utils/constants.ts`
- Modify: `frontend/src/lib/api/client.ts`
- Modify: `frontend/src/components/forum/resource-detail.tsx`
- Create: `frontend/src/components/forum/resource-comments.tsx`
- Create: `frontend/src/components/forum/resource-comment-editor.tsx`
- Create: `frontend/src/components/forum/resource-comment-tree.tsx`
- Test: `src/modules/resource-comments/resource-comments.service.spec.ts`
- Test: `src/modules/resources/resources.service.spec.ts`
- Test: existing report service tests

**Interfaces:**
- `GET /resources/:id/comments` supports root sort (`hot`, `newest`, `oldest`), cursor pagination, and collapsed child summaries.
- `GET /resources/:id/comments/:commentId/path` returns the target plus direct parent path and required first-level children for deep links.
- `POST`, `PUT`, reaction and report actions require authenticated, phone-verified users; management actions require admin or the resource-section permission.

- [ ] **Step 1: Add failing comment and rating tests**

  Cover phone verification rejection, public approved-resource requirement, one rating per user, unlimited parent references, 300-character Markdown limit, unsafe HTML/image rejection, edit blocked after report/hide/delete/child reply, deleted placeholder behavior, reaction switching, hot/newest/oldest sorting, and exact comment path loading.

- [ ] **Step 2: Implement comment schema and service policy**

  Store parent ID, sanitized Markdown HTML, visibility/deleted status, edited timestamp and reaction aggregates. Verify resource visibility before reads/writes. Preserve deleted nodes so child replies remain attached; reject new replies and interactions against deleted nodes.

- [ ] **Step 3: Integrate Markdown and site image uploads**

  Reuse the existing image upload authorization and sanitizer. Reject external image URLs in comment Markdown, strip scripts/events/unsafe links, count raw Markdown length including URLs, and expose a stable preview height with expand/collapse behavior.

- [ ] **Step 4: Implement reactions, reporting and auto-hide**

  Enforce one reaction per user/comment with atomic switching. Send comment reports through existing `reports` with a single resource-comment target type and supplemental reason. Reuse `report_auto_hide_threshold`, notify moderators/admins and the comment author once on threshold, and preserve audit records.

- [ ] **Step 5: Add comment UI and stable deep links**

  Render one child reply by default, lazy-load additional direct children, support infinite nesting with capped visual indentation, hot/newest/oldest root sorting, edit/reply/reaction/report controls, deleted placeholders and stable anchors. On `#rating`, `#comments`, `#comment/:id`, or `#reply/:id`, fetch the exact target path, expand it, and highlight the target.

- [ ] **Step 6: Run checks and commit**

  ```bash
  npx tsc --noEmit -p tsconfig.json
  npm test -- --runInBand
  cd frontend
  npx tsc --noEmit
  npm run build
  ```

  Commit as `feat(resources): add moderated comment discussions`.

---

### Task 5: Add favorites, follows, notifications, mail preferences, and social API clients

**Files:**
- Create: `src/entities/resource-bookmark.entity.ts`
- Create: `src/entities/resource-follow.entity.ts`
- Create: `src/database/migrations/1720000026000-CreateResourceSocial.ts`
- Modify: `src/modules/resources/resources.module.ts`
- Modify: `src/modules/resources/resources.controller.ts`
- Modify: `src/modules/notifications/notifications.service.ts`
- Modify: existing user notification preference entity/service and email template registry
- Modify: `frontend/src/lib/api/client.ts`
- Modify: `frontend/src/app/(auth)/resources/my/page.tsx`
- Modify: `frontend/src/components/forum/resource-detail.tsx`
- Modify: existing notification settings page
- Test: resource social service tests and notification service tests

**Interfaces:**
- Bookmark and follow APIs use unique `(user_id, resource_id)` rows and return current state plus count.
- Follow events publish resource update, withdrawal, maintenance, archive and restore notifications.
- Mail preferences are independent switches for comment replies, resource updates, comment moderation results, and ownership/maintainer changes; in-app notifications remain unconditional.

- [ ] **Step 1: Add failing social and notification tests**

  Test duplicate bookmark/follow prevention, immediate unfollow suppression, archived/invalid resource display retention in bookmarks, ownership transfer notification recipients, and mail disabled/enabled behavior without affecting in-app notifications.

- [ ] **Step 2: Implement bookmark and follow persistence**

  Add unique constraints, cursor pagination, category/tag/update-time filters for the personal bookmark list, and strict visibility checks for writes. Keep bookmarks and follows when a resource is paused, archived or possibly invalid.

- [ ] **Step 3: Implement event notification helpers**

  Add deduplicated in-app notifications for replies, comment moderation, version approval, recommendation rollback, maintenance/archive state and collaborator/ownership changes. Do not reveal reporter identity.

- [ ] **Step 4: Add email preference switches and queue integration**

  Extend existing preference storage and templates for the four event groups. Enqueue mail only when the matching preference is enabled; mail failures must not roll back resource actions or suppress in-app notifications.

- [ ] **Step 5: Add personal collection and detail controls**

  Add bookmark/follow buttons, counts, follow state, and the personal resource collection page with empty/error/loading states and filter/sort controls. Keep download history out of the user UI.

- [ ] **Step 6: Run checks and commit**

  ```bash
  npx tsc --noEmit -p tsconfig.json
  npm test -- --runInBand
  cd frontend
  npx tsc --noEmit
  npm run build
  ```

  Commit as `feat(resources): add bookmarks follows and notifications`.

---

### Task 6: Add discovery, recommendations, invalid-resource reports, collaboration, transfer, and statistics

**Files:**
- Create: `src/entities/resource-invalid-report.entity.ts`
- Create: `src/entities/resource-download.entity.ts`
- Create: `src/entities/resource-maintainer.entity.ts`
- Create: `src/entities/resource-transfer.entity.ts`
- Create: `src/entities/resource-version-audit.entity.ts`
- Create: `src/modules/resource-reports/` controllers, service, DTOs and module
- Create: `src/modules/resource-statistics/` controller, service and module
- Create: `src/database/migrations/1720000027000-CreateResourceOperations.ts`
- Modify: `src/modules/resources/resources.service.ts`
- Modify: `src/modules/resources/resources.controller.ts`
- Modify: `src/modules/resources/resources.module.ts`
- Modify: `src/modules/search/search.service.ts`
- Modify: `frontend/src/lib/api/client.ts`
- Modify: `frontend/src/app/(public)/resources/page.tsx`
- Modify: `frontend/src/app/(public)/resources/[id]/page.tsx`
- Modify: `frontend/src/app/(public)/users/[id]/page.tsx`
- Create: `frontend/src/components/forum/resource-recommendations.tsx`
- Create: `frontend/src/components/forum/resource-statistics.tsx`
- Create: `frontend/src/app/admin/resources/reports/page.tsx`
- Create: `frontend/src/app/admin/resources/collaborators/page.tsx`
- Test: invalid-report, download-audit, collaboration and recommendation service tests
- Test: Playwright resource community scenarios in the existing E2E location

**Interfaces:**
- Invalid reports target a resource or version and expose `pending`, `auto_flagged`, `confirmed`, `resolved`, and `dismissed` transitions.
- Download audit records only successful local/MFL/external delivery attempts with user/resource/version/source/result and no network identifiers.
- Owner/maintainer management distinguishes owner-only operations, maintainer operations, category-moderator operations and admin operations.
- Recommendation API returns at most six public resources scored by category, shared tags, compatible-version intersection and runtime intersection.

- [ ] **Step 1: Add failing lifecycle, report and statistics tests**

  Test permanent download records, owner-only detail visibility, maintainer no-comment-management boundary, accepted/declined/expired transfer, pause/archive/owner-restore rules, invalid-report threshold and confirmation, recommendation exclusions, and rating distribution/version-download aggregation.

- [ ] **Step 2: Implement invalid-resource report state machine**

  Add separate resource/version report storage with deduplication, threshold auto-flagging, owner/maintainer notifications, moderator/admin confirmation/resolution/dismissal, warning-only `possible_invalid` behavior, and hard download blocking only for confirmed invalid targets.

- [ ] **Step 3: Implement permanent download audit and statistics**

  Record successful downloads/redirect clicks after delivery validation. Add owner-only user-detail endpoints, maintainer aggregate endpoints, rating distribution, bookmark/follower counts, and per-version download summaries. Enforce privacy and ownership-transfer visibility rules.

- [ ] **Step 4: Implement maintainers and ownership transfer**

  Add owner-managed immediate add/remove, maintainer edit/version/withdraw capabilities, pending transfer requests with recipient accept/reject/expiry, cancellation, automatic former-owner maintainer status, and audit/notification events.

- [ ] **Step 5: Implement discovery and recommendations**

  Extend resource query DTOs for category descendants, tag OR, version range matching, runtime OR, update-time and sort options. Add full search fields and cached six-item recommendations, excluding current/deleted/archived/confirmed-invalid resources while allowing possible-invalid warnings.

- [ ] **Step 6: Add admin queues and frontend integration**

  Add paginated version review, invalid-report and collaborator management pages; add recommendation block, warning badges, statistics panels, owner controls and author-profile summary. Preserve existing async loading/error/empty behavior and responsive layouts.

- [ ] **Step 7: Run complete verification and commit**

  ```bash
  npx tsc --noEmit -p tsconfig.json
  npm test -- --runInBand
  npx playwright test
  cd frontend
  npx tsc --noEmit
  npm run build
  git diff --check
  ```

  Commit as `feat(resources): complete community resource center`.

---

## Cross-Batch Verification Matrix

For each batch, verify:

- Public approved resource loads, downloads, redirects and appears in search.
- Pending/rejected/private/withdrawn/archived/confirmed-invalid resources cannot be downloaded or externally opened through direct URLs.
- Owner can view status/rejection information without gaining download access.
- Pending new version leaves the old recommendation unchanged; approved version becomes recommendation; withdrawn recommendation falls back correctly.
- Resource can only be assigned to a末级分类 and parent filtering includes descendants.
- Tag input splits on spaces, normalizes and deduplicates; blocked tags are excluded from public discovery.
- Version range, discrete and special-version selection matches the maintained option list.
- Comments require phone verification for writes, preserve deleted tree nodes, sanitize Markdown/images, support reactions and deep links.
- Ratings remain one row per user/resource and show correct distribution.
- Bookmarks/follows retain state across pause/archive/possible-invalid transitions and suppress future follow notifications immediately after unfollow.
- Invalid reports warn at auto-flag and block only after moderator/admin confirmation.
- Download audit contains no IP/device identifiers and obeys owner/maintainer access boundaries.
- Mobile view has no horizontal overflow in galleries, Markdown, comment trees, filters or tables.
