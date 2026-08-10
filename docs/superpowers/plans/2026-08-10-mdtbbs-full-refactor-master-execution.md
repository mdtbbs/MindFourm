# MDTBBS Full Refactor Master Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. Execute phases in order. Do not skip a hard gate, fabricate an external integration result, or implement a later phase from an unverified assumption.

**Goal:** Execute the full approved MDTBBS refactor program from the current modular monolith to a platform-ready, client-ready system without parallel rewrites or destructive migration.

**Architecture:** Preserve the current NestJS/MySQL/Redis/Next.js application and evolve it through additive schemas, Application Services, V1 contracts, compatibility adapters, audited backfills, coarse feature flags, and reversible rollout. Web, Windows, Android, and future official clients consume `/api/v1/*`; existing `/api/*` remains a temporary compatibility surface backed by the same application logic.

**Tech Stack:** NestJS 10, TypeScript 5, TypeORM 0.3, MySQL 8, Redis, BullMQ where already present, Next.js 15, React 18, Jest, Playwright, MindAuth, MindFileList.

## Global Constraints

- Preserve existing integer IDs, `/resources/{id}` and `/posts/{id}` URLs, existing `/api/*` behavior, and current moderation/visibility rules.
- Do not create a parallel API/backend or clean-slate migration project.
- Do not split microservices without a measured performance, reliability, security, deployment, or ownership reason.
- Use additive migrations only: add → audit/backfill → reconcile → feature-flag cutover → remove Legacy path.
- Reuse `SettingsService` for coarse global rollout flags before considering new flag infrastructure.
- V1 JSON responses use `{ data, meta }`; V1 errors use `{ error, meta }`; streams, redirects, SSE, binary responses, and 204 bypass JSON serialization.
- `public_id` is stable external identity, not authorization and not a forced Web URL replacement.
- ResourceFile and MediaAsset share storage infrastructure but are different domain objects.
- New managed installable files require SHA-256 verification; Legacy files may remain Web-downloadable with `unverified_legacy` integrity status.
- Public download count means effective, deduplicated delivery grants; retain Legacy download totals as unattributed baseline.
- Redis Pub/Sub may fan out realtime events but is never the durable event source of truth.
- Do not commit unless the user explicitly authorizes a commit. Keep review checkpoints and test evidence after every task.

---

## Authoritative Inputs

1. **Architecture baseline**  
   `docs/superpowers/specs/2026-08-10-mdtbbs-overall-refactor-design-v2.md`

2. **Detailed P0-A execution plan**  
   `docs/superpowers/plans/2026-08-10-p0a-v1-contract-resource-audit.md`

3. **P0-A handoff**  
   `docs/superpowers/plans/2026-08-10-p0a-v1-contract-resource-audit-handoff.md`

The architecture baseline wins if this master plan and a phase-level plan disagree.

---

## Hard Gates

| Gate | Required evidence | Continue only when |
|---|---|---|
| G0 — Repository baseline | `git status`, backend build, Jest baseline | Existing unrelated work is identified and the target files are known |
| G1 — Legacy Resource Audit | `npm run audit:resources` JSON report | Every anomaly is mapped to deterministic migration treatment or explicitly excluded |
| G2 — MindAuth decision | Capability report and approved ADR | Mode A token validation or Mode B broker design is selected |
| G3 — MFL delivery decision | MFL capability probe/report | Provider can be classified as public redirect, controlled delivery, or unsupported for the target policy |
| G4 — Chinese Search benchmark | Reproducible query corpus and measured results | MySQL FTS/projection/external engine choice is recorded |
| G5 — Client Pilot | Contract fixture and pilot results | No client requires HTML scraping, cookies, service keys, or internal DB fields |
| G6 — Client GA | GA Gate checklist from v2 specification | Auth, API, delivery, migration, observability, and compatibility are proven |

If a gate fails, stop the affected phase, retain the existing production path, document the result, and proceed only with phases that do not depend on that gate.

---

## Phase 0: Preflight and P0-A Contract Foundation

### Deliverable

A V1 transport contract, coarse Settings-backed capability flags, V1 OpenAPI baseline, request IDs, and a read-only Legacy Resource audit.

### Execute

Execute every task in:

`docs/superpowers/plans/2026-08-10-p0a-v1-contract-resource-audit.md`

### Required evidence

```text
Focused P0-A Jest tests pass
Full non-E2E Jest suite passes
npm run build:backend passes
GET /api/v1/capabilities returns V1 envelope
OPENAPI_ENABLED=true exposes /api/docs/v1
npm run audit:resources produces valid JSON
```

### Exit criteria

- G0 and G1 are satisfied.
- No Resource schema, Backfill write, Device Auth, Outbox, Media, Download Grant, or Object Storage implementation was added.
- Existing `/api/*` envelopes and SSE behavior are unchanged.

---

## Phase 1: Resource Core Schema and Version Comparator

### Goal

Create the minimal structured Resource aggregate without changing current public reads or downloads.

### Create

```text
src/common/versioning/mindustry-version-value.ts
src/common/versioning/mindustry-version-comparator.ts
src/common/versioning/mindustry-version-comparator.spec.ts
src/entities/resource-attribution.entity.ts
src/entities/resource-file.entity.ts
src/entities/resource-version-dependency.entity.ts
src/entities/resource-version-compatibility.entity.ts
src/database/migrations/1720000026000-ExpandResourceAggregate.ts
src/modules/resources/resource-aggregate.types.ts
src/modules/resources/resource-aggregate.service.ts
src/modules/resources/resource-aggregate.service.spec.ts
```

### Modify

```text
src/entities/resource.entity.ts
src/entities/resource-version.entity.ts
src/entities/index.ts
src/database/migrations/index.ts
src/modules/resources/resources.module.ts
src/modules/resources/resources.service.ts
```

### Required model

```text
Resource:
  public_id, summary, resource_kind, visibility, homepage_url,
  source_url, license, latest_published_version_id,
  discussion_thread_id, metadata_json

ResourceVersion:
  public_id, release_channel, status, release_notes_markdown,
  release_notes_html, published_at, created_by_user_id,
  reviewed_by_user_id, reviewed_at, reject_reason,
  is_legacy_root_release

ResourceFile:
  public_id, resource_version_id, role, delivery_mode,
  platform_key, architecture_key, package_type, display_name,
  original_filename, mime_type, size_bytes, hash_algorithm,
  content_hash, integrity_status, storage_backend, storage_key,
  provider_file_id, external_url, availability_status, sort_order
```

### Migration rules

- Add nullable columns and new tables only.
- Add `resources.latest_published_version_id` only after `resource_versions` is available; enforce `ON DELETE SET NULL`.
- Use existing migration helper functions from `src/database/migrations/migration-utils.ts` for MySQL idempotency.
- Do not drop `resources.file_*`, `resources.mfl_*`, `resources.external_url`, `resources.version`, or legacy Version file columns.
- Use `CHAR(36)` UUID public IDs generated through Node `randomUUID()`; do not add a UUID package.

### Tests

```text
MindustryVersionValue parses and compares 159, 159.1, 159.7
Resource latest version becomes null when its Version is deleted at DB level
Application Service chooses newest published Version after a withdraw
ResourceFile rejects unsupported delivery/integrity combinations
Attribution permits submitter without falsely requiring original author
Foreign-key, unique-index, and fresh/upgrade migration tests pass
```

### Exit criteria

- New tables/columns exist on fresh and upgrade fixtures.
- No public controller reads them yet.
- Existing Resource tests continue passing.
- G1 anomaly report has a documented mapping for every backfill category.

---

## Phase 2: Legacy Resource Backfill, Reconciliation, and V1 Read

### Goal

Backfill structured resource facts safely, preserve Legacy projection, and expose a flag-gated V1 Resource read API.

### Create

```text
src/database/backfills/resource-v2.backfill.ts
src/database/backfills/resource-v2.backfill.spec.ts
src/database/backfills/resource-v2.reconciliation.ts
src/modules/resources/resource-read-adapter.service.ts
src/modules/resources/resource-legacy-projection.service.ts
src/modules/resources/v1/resources-v1.controller.ts
src/modules/resources/v1/resources-v1.dto.ts
src/modules/resources/v1/resources-v1.controller.spec.ts
```

### Modify

```text
src/modules/resources/resources.module.ts
src/modules/resources/resources.service.ts
src/modules/settings/settings.service.ts
src/entities/resource.entity.ts
src/entities/resource-version.entity.ts
```

### Backfill sequence

```text
Audit report
→ dry-run report
→ idempotent checkpointed backfill
→ reconciliation report
→ V1 shadow read
→ Settings-flag read cutover
```

### Deterministic mappings

| Legacy condition | Structured mapping |
|---|---|
| `resources.user_id` | ResourceAttribution role `submitter` |
| `resources.description` non-empty | `summary` source, copied exactly |
| Root file / MFL / external URL | Legacy Root Release + ResourceFile |
| Blank legacy version | Internal unique version; V1 displays unknown/legacy state |
| New managed file hash unavailable | not client-installable until verified |
| Legacy path/MFL file hash unavailable | `integrity_status=unverified_legacy` |
| Invalid external URL | `availability_status=unavailable`, not silently published |
| Historic download count | retained separately for future baseline aggregation |

### V1 endpoints

```text
GET /api/v1/resources
GET /api/v1/resources/{resource_public_id}
GET /api/v1/resources/{resource_public_id}/versions
```

These endpoints are ordinary V1 JSON responses and must use the existing public visibility policy. When `feature_resources_v1_read_enabled=false`, they return `CLIENT_UPGRADE_REQUIRED` or `RESOURCE_V1_DISABLED` according to the approved error registry; Legacy `/api/resources` remains functional.

### Tests

```text
Root-only file
Version-only file
Root plus same-version record
MFL resource
External resource
Unavailable external URL
Blank version
Duplicate version
Missing file
Soft-deleted resource
Pending/rejected resource
Disabled category
Blank description
Legacy download_count > 0
```

### Exit criteria

- Every read-only V1 resource fixture matches a Legacy-compatible projection.
- Backfill can run twice without duplicate ResourceFile or Attribution records.
- V1 public reads cannot reveal pending, rejected, soft-deleted, or disabled-category data.
- V1 reads are Settings-gated; Legacy reads remain unaffected.

---

## Phase 3: Resource Detail V1 UI

### Goal

Give users an early visible result from the structured Resource read model without moving download delivery yet.

### Create

```text
frontend/src/lib/api/v1/transport.ts
frontend/src/lib/api/v1/resources.ts
frontend/src/lib/api/v1/resources.test.ts
frontend/src/components/resources/resource-version-file-list.tsx
frontend/src/components/resources/resource-attribution-list.tsx
```

### Modify

```text
frontend/src/types/index.ts
frontend/src/app/(public)/resources/[id]/page.tsx
frontend/src/components/forum/resource-detail.tsx
frontend/src/lib/seo/description.ts
```

### Rules

- Keep `/resources/{id}` and current canonical behavior.
- Resolve legacy numeric route IDs through the existing detail API until a separate URL migration is approved.
- When `feature_resources_v1_detail_enabled=false`, keep the existing Resource Detail renderer.
- When enabled, render attribution, Version state, files, compatibility, and integrity state from V1 DTOs.
- Do not claim a file is installable when `integrity_status` is `unverified_legacy`.
- Keep final V1 Download Grant work out of this phase. Existing download behavior is preserved until Phase 4.

### Tests

```text
SSR renders V1 attribution and a Version list
Unknown legacy version is human-readable, never `legacy-{id}`
Unverified legacy files show a verification warning
Disabled V1 detail flag preserves the current renderer
Metadata and canonical URL remain unchanged
Mobile layout does not overflow with multiple files
```

### Exit criteria

A Settings-flagged Web detail experience consumes V1 resource DTOs while current routes and download behavior remain usable.

---

## Phase 4: Media, Storage Provider, Delivery Strategy, and Download Policy

### Goal

Separate display media from delivery files and move Web downloads behind one policy without making Object Storage mandatory.

### Create

```text
src/modules/media/media.module.ts
src/modules/media/media-asset.entity.ts
src/modules/media/resource-media-link.entity.ts
src/modules/media/media.service.ts
src/modules/media/media.service.spec.ts
src/modules/downloads/downloads.module.ts
src/modules/downloads/download-policy.service.ts
src/modules/downloads/download-grant.service.ts
src/modules/downloads/download-events.service.ts
src/modules/downloads/storage-provider.interface.ts
src/modules/downloads/delivery-strategy.interface.ts
src/modules/downloads/download-policy.service.spec.ts
src/modules/downloads/download-grant.service.spec.ts
src/database/migrations/1720000027000-CreateMediaAndDownloadDelivery.ts
```

### Modify

```text
src/entities/index.ts
src/modules/resources/resources.controller.ts
src/modules/resources/resources.service.ts
src/modules/resources/mfl-client.service.ts
src/modules/uploads/uploads.service.ts
src/modules/resources/resources.module.ts
frontend/src/lib/api/v1/resources.ts
frontend/src/components/resources/resource-version-file-list.tsx
```

### Rules

- Implement Local and MFL provider adapters only to the degree their verified capabilities permit.
- Treat external URLs as Delivery Strategy inputs, not Storage Provider objects.
- Use public redirect for truly public immutable files when policy permits.
- Use short-lived controlled delivery for restricted files only where provider capability supports it.
- Do not claim individual signed-URL revocation when the provider cannot revoke one already issued.
- New managed installable files require SHA-256 verification; scanning policy is independent and enabled only when scanner capability is proven.

### Delivery endpoints

```text
POST /api/v1/resource-files/{file_public_id}/download-grants
GET /api/v1/resources/{resource_public_id}/versions/{version_public_id}/files/{file_public_id}/download
```

The POST returns V1 JSON. The GET is raw redirect/stream and is decorated to bypass JSON serialization.

### Statistics

Create `download_events` and aggregation logic. Public count is effective deduplicated `granted`; retain historic `resources.download_count` as a legacy baseline and never reset it to zero.

### Exit criteria

- Web uses the shared Download Policy.
- Download visibility cannot bypass Resource status/category rules.
- Legacy unknown files remain Web-downloadable where they were previously eligible.
- New verified files expose installable/verifiable capability.

---

## Phase 5: MindAuth Decision, Device Principal, and Event Boundary

### 5A — MindAuth Capability Audit

Run and record tests against the real MindAuth integration for:

```text
Authorization Code
PKCE
access token verification
refresh rotation
revoke
JWT/JWK or introspection
audience
client registration
device/session management
```

Create an ADR selecting exactly one mode:

```text
Mode A: MindAuth-issued client token validated by MDTBBS
Mode B: MDTBBS broker/device-session adapter, only if MindAuth cannot satisfy lifecycle needs
```

Do not create client-session tables before this ADR is approved.

### 5B — Device Principal

Implement only the selected mode. Browser Cookie Sessions stay valid. Devices never use `forum_session` cookies, HTML scraping, passwords, or `/api/external/v1` keys.

### 5C — Minimum durable event

Create Transactional Outbox only now, when `ResourceVersionPublished` has real consumers:

```text
ResourceVersionPublished
→ Notification record
→ cache invalidation
→ Search projection trigger
```

Use MySQL transaction plus outbox for durable truth. Redis Pub/Sub only fans out the persisted notification to SSE.

### Exit criteria

- G2 is satisfied.
- A device principal can use V1 Resource reads/downloads.
- Resource publication side effects are recoverable after process failure.

---

## Phase 6: Client Contract Pilot

### Scope

```text
Authentication
V1 Resource read
ResourceFile capability
Download grant
Hash verification
Retry and weak-network behavior
Deep Link resolution
Basic notification read/realtime behavior
V1 errors and capabilities
```

### Explicit exclusions

```text
Favorite
Creator profile
Server
Knowledge
Forge
Discover
Portal
Full client GA
```

### Deliverables

- Versioned OpenAPI fixture.
- A small Windows/Android prototype or a protocol-level client harness.
- A client compatibility test suite replaying the fixture.
- Pilot report documenting missing capability, retry, or DTO defects.

### Exit criteria

G5 is satisfied: no client depends on HTML, Cookie Session, service API keys, or internal database fields.

---

## Phase 7: Community V1, Creator, and Unified Search

### Community

- Expose current Post as V1 Thread without renaming `posts` table.
- Add Resource Favorite and Resource Subscription as focused tables; do not introduce an unconstrained universal favorite table.
- Build Creator aggregation from Resource Attribution, Threads, and existing social data.

### Search

- Run G4 Chinese benchmark first.
- Index only public/discoverable resources and threads.
- Keep Resource/Community read policy as final visibility authority.
- Provide `/api/v1/search` and a unified Web Search UI.

### Exit criteria

Users can discover Resources and Threads through one V1 search response and see creator contribution without new URL/ID breaks.

---

## Phase 8: Independent Domain Products

Execute independently; do not merge into one giant task.

### 8A — GameVersion

Create GameVersion, Build, File, Release Channel, official source, and changelog contracts. Reuse Mindustry Version Comparator. Provide Version Detail and V1 API before client version-management features.

### 8B — Server

Create local Server, Endpoint, Status Snapshot, and Discussion Link models. Preserve EasyManager as an adapter. Make external failures explicit and test timeout/retry/circuit behavior before public Server Detail rollout.

### 8C — Knowledge

Create Knowledge Article, Revision, and Resource/Thread/Server/Version relation models. Avoid expanding into a general CMS.

### 8D — Forge

Introduce Forge Job/Result and preview Media only when Map/Blueprint Resource files require real parsing. Isolate CPU/memory/untrusted-file processing before extracting a separate worker/service.

---

## Phase 9: Discover, Portal, and Client GA

### Discover

Build only from stable Resource, Thread, Search, Activity, Server, Version, and Knowledge DTOs. Do not implement a speculative recommendation engine.

### Portal

Upgrade the homepage incrementally:

```text
featured content
latest threads
latest resources
versions
servers
knowledge
```

Hide or down-rank modules when data volume is insufficient.

### Client GA

Pass all GA gates from the approved v2 design before public Windows/Android launch:

```text
device lifecycle and revocation
V1 deprecation and compatibility fixture
stable Resource/Version/File/Download DTOs
verified download metrics and legacy baseline
non-bypassable visibility/moderation
audited backfill and feature cutover
observable storage/outbox/realtime behavior
weak-network and previous-client tests
```

---

## Full-Program Verification Matrix

| Area | Required evidence |
|---|---|
| Migrations | Fresh DB, upgrade DB, duplicate run, rollback/drill where supported |
| Backfill | Dry-run, checkpoint rerun, reconciliation, dirty-data matrix |
| API | V1 OpenAPI snapshot, legacy/V1 projection fixtures, error schema |
| Resource | Multi-file, multi-version, attribution, compatibility, integrity states |
| Download | public/restricted/external/MFL/local, rate-limit, redirect, stream, event aggregate |
| Auth | selected MindAuth mode, expiry, revoke, device/session behavior |
| Event | outbox retry, idempotency, multi-instance SSE recovery |
| Search | Chinese corpus, visibility, unlisted/private behavior, pagination |
| Frontend | SSR, metadata, canonical URLs, responsive resource detail, states |
| Pilot | client fixture replay, hash, retry, deep link, no HTML/cookie/service-key dependency |

---

## Master Completion Definition

The master plan is complete only when:

1. Every phase either meets its exit criteria or is explicitly blocked by a documented hard gate.
2. No blocked external capability has been silently replaced by an unreviewed incompatible implementation.
3. Existing users retain access to Legacy URLs, resources, API behavior, and historic download totals throughout migration.
4. Web consumes the same stable V1 contract that the Client Pilot validates for the capabilities it uses.
5. A public client launch occurs only after G6, not merely after code compiles.
