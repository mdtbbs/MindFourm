# MindFourm — AI 开发上下文

本文件是 MindFourm 仓库的当前工程上下文。涉及接口、数据库、部署和功能状态时，先以代码与下方标注的现行文档为准；历史计划和旧版参考不能作为当前实现证据。

## Documentation Map

- [`docs/README.md`](docs/README.md)：中文文档索引和阅读入口。
- [`docs/api/README.md`](docs/api/README.md)：Public V1 边界、认证、响应、OpenAPI 和客户端文档入口。
- `docs/api/*.md`：Public V1 OAuth/PKCE、资源、游戏内容、多人联机、云存档、错误码、富文本、Changelog 和生命周期契约。
- [`docs/resource-storage.md`](docs/resource-storage.md)：RES 上传、binding 生命周期、历史兼容及手动迁移。
- [`docs/resource-storage-reconciliation.md`](docs/resource-storage-reconciliation.md)：Forum↔RES 对账、审计和显式修复边界。
- [`docs/resource-center-v2.md`](docs/resource-center-v2.md)：Resource Center V2 的资源、版本、成员、审核、分析、manifest 与接口。
- [`docs/schematic-editor.md`](docs/schematic-editor.md)、[`docs/map-editor.md`](docs/map-editor.md)：官方 renderer 编辑器的安全范围和已知限制。
- [`docs/platform-2.7.0.md`](docs/platform-2.7.0.md)：2.7.0 平台能力收口与证据层。
- [`docs/international-site-profiles.md`](docs/international-site-profiles.md)：`mdtbbs` 与 `mindustry-club` 部署配置及隔离要求。
- [`docs/production-deployment.md`](docs/production-deployment.md)：生产配置、迁移和发布检查；执行前仍需核对当前代码和部署状态。
- `docs/design/`：设计背景。逐项确认是否与当前实现一致后才可用于实施。
- `docs/superpowers/plans/`、`docs/superpowers/specs/`：历史方案，不代表当前状态。

## Project Structure and Sources of Truth

- NestJS backend starts at `src/main.ts`; root module registration is in `src/app.module.ts`.
- Backend modules live in `src/modules/`; entity registration is maintained in `src/entities/index.ts`; TypeORM migrations are registered from `src/database/migrations/`.
- Next.js frontend lives in `frontend/`. Shared site profile data is in `src/config/site-profile-data.ts` and `frontend/src/config/site-profile.ts`.
- Do not maintain hand-counted totals for modules or entities. Read `src/app.module.ts`, `src/entities/index.ts`, and `src/modules/` when the exact structure matters.
- Forum business data and Resource aggregates are separate from file bytes. `ResourceStorageClientService` stores new durable resource bytes in RES; `ResourceStorageService` retains temporary staging and historical local compatibility, while `ResourceFileProviderService` selects RES, managed, MFL or external delivery. Keep large binary transfers off the primary forum web path where the deployment uses a file service. Resource APIs are not generic object storage; RES owns content-addressed objects and deduplication; forum deletion removes bindings, never shared CAS objects.

## Public API Contract

- The stable first-party/public client contract is the explicitly filtered Public V1 OpenAPI, not every controller whose URL contains `/v1`.
- Runtime API paths use `/api/v1/*`. Other `/api/*` routes are legacy, first-party compatibility, management, or internal routes unless separately documented. `/api/external/v1/*` is the separately authenticated server-integration surface, not the third-party client API.
- When `OPENAPI_ENABLED` is not `false`, runtime documentation is served at `/api/v1`, `/api/v1/reference`, `/api/v1/docs/*`; public machine-readable JSON is served at `/api/openapi/v1.json` and `/api/openapi/public-v1.json`.
- `openapi-v1.json` and `openapi-public-v1.json` are the public contract and compatibility mirror; `openapi-internal-v1.json` is a development snapshot and is not a public API.
- If a Public V1 OpenAPI contract file changes, update `docs/api/changelog-v1.md` in the same PR. CI enforces this with `scripts/check-api-changelog.cjs`; `npm run openapi:check` independently verifies generated contract drift.
- Preserve existing Public V1 operations, including the documented Messages operations. Never add a legacy controller to the public allowlist solely to make a doc link work.
- Public V1 success/error JSON envelopes are `{ data, meta }` and `{ error, meta }`; use stable `error.code` and HTTP status for control flow. File and redirect responses can be raw HTTP responses.

## Rich Content

- Posts, replies, resources, and supported long-form fields use Tiptap/ProseMirror rich content. The canonical format is `content_format: "tiptap_json"`, `content_schema_version`, and `content_json` (Schema v2 for current new writes).
- The frontend editor schema and serializers live under `frontend/src/lib/tiptap/`; backend validation, canonicalization, safe HTML rendering, text extraction, and Markdown conversion live under `src/common/utils/` and the relevant module write services.
- `content_html` and `content_text` are derived projections. Markdown `content` remains for legacy input and compatibility/search/notification/RSS/plain-text use; Markdown is not the canonical new-write format.
- Markdown-only legacy requests are still accepted on compatibility paths and converted to the rich JSON form. Bulk conversion is separately implemented by `src/scripts/content-json-backfill.ts`; do not claim all production rows have been backfilled without deployment evidence.
- Keep schema changes synchronized across frontend editor, backend validation/serialization, OpenAPI DTOs, and `docs/api/rich-content-schema-v2.md`.

## Resource Center V2

- Resource V2 extends the existing Resource aggregate; Mod, Map, and Schematic are first-class resource kinds, not secondary attachments.
- `ResourceVersion` stores immutable revisions. Publishing an already-used display version creates a new revision rather than overwriting a published file.
- Current V2 contracts include public UUID identifiers (`public_id`), owner/member roles and invitations, review events and annotations, compatibility and dependencies, version analysis, type-specific manifests, GitHub Release source sync, and Mod/Map/Schematic read APIs.
- Uploads enter quarantine/pending review and become published only after the review decision. Review, approval, and storage transitions are implemented in the Resource V2 services; preserve quarantine files when a review fails or is rejected.
- Forum stores Resource business metadata, ownership, versions, and moderation state. File storage handles the binary lifecycle and delivery. Keep Resource API behavior explicit and resource-oriented; do not present it as a generic blob API.
- Metadata-first direct upload keeps browser bytes on ResourceStorage; Forum completion must re-read authoritative object metadata and only then create a pending private binding. ResourceStorage reconciliation is administrator-triggered, records request/completion operation logs, and never deletes objects automatically.
- Renderer-backed schematic/map editing always exports a new version. Capability flags are fail-closed on protocol, pinned runtime digest, operation allowlist, and RES health; do not describe unsupported map layers or unknown schematic configuration as editable.
- Resource V2 migrations and any required backfill need separate production acceptance. Do not infer that a local migration or source build proves production schema/data readiness.

## Download Events and Analytics

- `DownloadEvent` is a TypeORM entity in `src/entities/download-event.entity.ts`; the database persists `requested`, `granted`, `started`, `completed`, and `failed` lifecycle events.
- `DownloadGrantService` records requested/granted events, deduplicates grants using a database deduplication table and a 60-second window, and increments the Resource aggregate only for a new grant. `DownloadEventsService` records transfer lifecycle outcomes.
- `StatsService` aggregates durable granted/failed counts by time range; the admin dashboard displays downloads and related range metrics. Do not describe download tracking as memory-only.

## Network Bans

- `src/modules/bans/bans.service.ts` normalizes IPv4 and IPv6 addresses, validates both IPv4 and IPv6 CIDR prefixes, and compares only addresses from the same family. `src/modules/bans/bans.service.spec.ts` covers IPv6 normalization, CIDR validation, and matching. Do not claim IPv6 CIDR is unsupported.

## Database and Migrations

- Use the explicit TypeORM migration registry in `src/database/migrations/`. Keep `synchronize: false` on the application and CLI DataSources; do not use runtime schema synchronization as a migration substitute.
- The application DataSource currently sets `migrationsRun: true`, so pending tracked migrations are run during application initialization. Production release procedures should inspect with `npm run migration:show`, make migration execution an explicit release gate (normally `npm run migration:run` before service start), then verify the resulting migration state. The initial baseline migration has a special empty-schema bootstrap path; this is not permission to enable general `synchronize`.
- Resource V2 schema migrations and data backfills must be reviewed and accepted against the target production database separately. Do not run migrations or backfills in production as part of ordinary documentation work.

## Site Profiles

`SITE_PROFILE` on the backend and `NEXT_PUBLIC_SITE_PROFILE` at frontend build time must match. Each profile is one deployment, not runtime multi-tenancy; use separate databases, Redis, upload roots, OAuth clients, and credentials.

| Profile | Locale and verification | Profile-specific features |
| --- | --- | --- |
| `mdtbbs` | Chinese (`zh-CN`); community writes require verified phone; email verification is not the profile gate | LanLink, developer feed, and server applications/directory are enabled by profile; domestic filing applies |
| `mindustry-club` | English by default with Russian and Japanese; email is required for writes; phone verification is not required | server applications, LanLink, developer feed, and domestic filing are disabled; developer docs are enabled |

Runtime settings and feature flags can further disable functionality. Check `src/config/site-profile-data.ts`, `frontend/src/config/site-profile.ts`, and `src/modules/settings/` before describing a toggle as universally enabled.

## Known Product Gaps

- Polls are not implemented.
- Group chat has no complete user-facing chat experience.
- Plugin frontend theme/template injection and hot reload are not implemented.
- A general-purpose blob API outside the ResourceStorage resource-file CAS is not implemented; resource uploads use the ResourceStorage CAS, binding, GC, and reconciliation contracts documented above.

Do not report implemented dashboard download analytics, IPv6 CIDR, Resource public UUIDs, or Tiptap storage as outstanding work.

## Development and Definition of Done

Use Node.js 20 as in CI. Install dependencies with `npm ci` at the repository root and `npm ci` in `frontend/` when frontend packages are needed.

Backend/API changes should run:

```bash
npm run build:backend
npm test -- --runInBand
npm run openapi:check
npm run test:api-changelog
```

Frontend changes should run:

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

Changes to Resource or user-critical flows should run the relevant Playwright E2E coverage where an isolated local environment is available:

```bash
npm run test:e2e -- --project=chromium tests/e2e/product-smoke.spec.ts tests/e2e/resource.spec.ts tests/e2e/resource-v2-review.spec.ts
```

A command that was skipped or blocked is not a passing check; report exact results and limits. E2E global teardown deletes rows matching its test prefixes from the configured MySQL database, so verify the database is isolated before running it.

Before delivery, run `git diff --check` and inspect `git status`. Preserve unrelated work. Do not run production migrations, backfills, or deployments unless the user explicitly asks for that operational work.
