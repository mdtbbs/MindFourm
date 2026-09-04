# MDTBBS Overall Refactor Design v2

**Date:** 2026-08-10  
**Status:** Approved design baseline — pending written-spec review  
**Scope:** The current MindFourm NestJS/Next.js repository. MDT Account, Forge, Windows, and Android are represented as contracts, prerequisites, and future workstreams; they are not treated as already-audited implementations.

## 1. Executive summary

MDTBBS will evolve through **Modular Monolith + API First + incremental Strangler Migration**. The goal is not to rewrite the forum, split services prematurely, or replace the stack. The goal is to preserve the running NestJS/MySQL/Redis/Next.js system while establishing stable domain boundaries, structured resource delivery, and a first-party API suitable for Web, Windows, Android, and future official MDT clients.

The primary gap is not a lack of modules. The repository already has substantial forum, resource, moderation, notification, SEO, and integration functionality. The gap is that Resource, download delivery, device authentication, events, and APIs remain oriented around current Web behavior and one-file resource records instead of long-lived cross-client contracts.

### Decisions already made

- Keep NestJS, MySQL, Redis, TypeORM migrations, and the feature-oriented modular monolith.
- Do not build a parallel platform or clean-slate rewrite.
- Do not make microservice extraction a prerequisite for platform work.
- Keep existing integer primary keys, Web URLs, Legacy APIs, and existing user behavior compatible.
- Add `public_id` only where cross-client identity, Deep Links, or external references require it.
- Add V1 alongside Legacy APIs and share Application Services; do not copy business logic.
- Expand the existing `resources` and `resource_versions` tables incrementally and introduce `resource_files`.
- Validate MindAuth capabilities before designing a device-token issuer.
- Run a small Client Contract Pilot shortly after core V1, resource delivery, device authentication, and basic notification contracts stabilize—not after every future domain is complete.

## 2. Verified current repository baseline

| Domain | Verified current state | Direction |
|---|---|---|
| Backend | NestJS modular monolith; broad feature-module composition in `src/app.module.ts` | Preserve and clarify ownership boundaries |
| Persistence | TypeORM entities/migrations; `migrationsRun: true`; `synchronize: false` in `src/database/database.module.ts` | Preserve migration discipline |
| Resource | `Resource` combines metadata, root file fields, MFL fields, external URL, version, content, moderation, and counters | Evolve incrementally to an aggregate |
| Version | `ResourceVersion` stores one file's metadata and notes | Extend the table; add ResourceFile |
| MFL | Upload, approval synchronization, and deletion-side download blocking in `mfl-client.service.ts` | Retain behind provider boundary |
| Download | Visibility check then local stream, MFL redirect, or external redirect; counter increment in resource controller | Centralize policy and statistics |
| Web authentication | MindAuth OAuth callback creates Redis session and HttpOnly cookie | Keep for Web; decide device path after audit |
| Automation API | `/api/external/v1/*` uses API key and scopes | Retain; not a user-device API |
| Notifications | Persistent notification records, SSE, email queue | Preserve behavior; add event boundary later |
| Search | Escaped LIKE search plus history/popular queries | Benchmark Chinese search before selecting index strategy |
| Settings | Cached Key-Value settings include `feature_*_enabled` flags in `SettingsService` | Reuse for coarse global flags |
| Frontend | Next.js public pages provide SSR, metadata, canonical URLs, and sitemap; client API registry is centralized | Preserve SSR; split SDK by domain |

### Naming policy

- **MDTBBS** is the public product name.
- **MindFourm** is the repository and legacy internal service name.
- **MindForum** is a historical display fallback that should be removed from user-facing runtime branding through the already-scoped brand cleanup work.
- This design does not authorize a repository, package, database, or directory rename.

## 3. Scope, non-goals, and principles

### 3.1 Current must-have capabilities

```text
V1 Contract
Resource / ResourceVersion / ResourceFile
Legacy resource audit, backfill, and adapter
Minimum Mindustry Version Comparator
Minimum Media model
Storage and Delivery responsibility boundaries
Download Policy, grant, event, and historical baseline
MindAuth capability audit and authentication decision
Minimum resource publication event and notification contract
Client Contract Pilot
```

### 3.2 Future extensions, not current blockers

```text
Full GameVersion product
Structured Server product
Knowledge/Wiki product
Forge worker extraction
Discover
Portal homepage
Object storage production migration
Client GA
Dependency auto-resolution
Full resource subscription and creator profile
```

### 3.3 Non-goals

- Do not create a parallel MDTBBS backend.
- Do not change all primary keys to UUIDs.
- Do not force a Web URL migration when adding `public_id`.
- Do not pre-build a generic feature platform, event platform, or storage platform.
- Do not treat all resources as installable.
- Do not require signed URLs for every public file.
- Do not require malware scanning before every resource can publish unless a reliable scanner and policy are operational.
- Do not make client applications scrape HTML, retain Web cookies, or use service API keys.

### 3.4 Mandatory principles

1. **Additive first:** add → migrate → validate → cut over → remove.
2. **Compatibility first:** preserve legacy IDs, routes, APIs, and visible behavior during transition.
3. **Contract first:** capabilities shared by Web and clients require explicit DTOs, errors, and versioning.
4. **Domain before surface:** UI cannot define database structure through temporary fields.
5. **Module data ownership:** each module owns its Entity, repository writes, and core rules.
6. **Synchronous decisions, asynchronous side effects:** authorization and policy checks are synchronous; search, notification, activity, and analytics are event-driven.
7. **No premature microservices:** extract only for demonstrated performance, reliability, security, deployment, or ownership boundaries.
8. **Observable and reversible:** every backfill and feature switch needs a measurement and rollback path.
9. **Foundation plus visible outcome:** each foundation phase ships a small user-visible improvement.
10. **No blind historical inference:** do not infer original author, license, compatibility, or file hash from incomplete legacy records.

## 4. Target architecture

```text
       Web · Windows · Android · 联机 Mod
                       │
          ┌────────────┴─────────────┐
          │ Unified First-party API  │
          │       /api/v1/*          │
          └────────────┬─────────────┘
                       │
       ┌───────────────┴────────────────┐
       │ Legacy Compatibility /api/*    │
       │ Automation /api/external/v1/*  │
       └───────────────┬────────────────┘
                       │
 ┌─────────────────────┼─────────────────────────┐
 │ Identity & Access   │ Community               │
 │                     │ Thread / Reply          │
 ├─────────────────────┼─────────────────────────┤
 │ Resources           │ Versions / Servers      │
 │ ResourceVersion     │ Knowledge               │
 │ ResourceFile        │                         │
 ├─────────────────────┼─────────────────────────┤
 │ Media               │ Search                  │
 │ Notifications       │ Activity                │
 └─────────────────────┼─────────────────────────┘
                       │
             Application / Event Boundary
                       │
         ┌─────────────┼──────────────┐
         │             │              │
       MySQL         Redis     Storage / Delivery
                                      │
                       Local · MFL · Object Storage
```

### 4.1 API roles

| API | Role | Consumers |
|---|---|---|
| `/api/v1/*` | Stable first-party client contract | Web, Windows, Android, Mod, future official clients |
| `/api/*` | Legacy Compatibility API | Current Web and old consumers |
| `/api/external/v1/*` | Service Automation API | API-key integrations and automation |

### 4.2 Controller and business boundaries

```text
Controller / Transport
        ↓
Application Service
        ↓
Domain Policy / Domain Model
        ↓
Repository / Provider / Infrastructure
```

A Legacy Controller and a V1 Controller may serialize different DTOs, but must invoke the same Application Service. Raw HTTP delivery endpoints are explicitly excluded from ordinary JSON serialization.

## 5. API V1 contract

### 5.1 JSON responses

Ordinary JSON endpoints return:

```json
{
  "data": {},
  "meta": {
    "request_id": "req_..."
  }
}
```

Cursor pages return:

```json
{
  "data": [],
  "meta": {
    "next_cursor": "...",
    "has_more": true,
    "request_id": "req_..."
  }
}
```

Errors return:

```json
{
  "error": {
    "code": "RESOURCE_FILE_NOT_READY",
    "message": "资源文件暂不可用",
    "retryable": true,
    "details": []
  },
  "meta": {
    "request_id": "req_..."
  }
}
```

### 5.2 Raw HTTP responses

The JSON envelope does **not** apply to:

- Download streams;
- 302/307 redirects;
- SSE;
- 204 responses;
- binary media delivery;
- future WebSocket upgrades.

The V1 serializer must deliberately bypass the existing response wrapper for these transports. It must not rely on implicit framework behavior.

### 5.3 Error registry

Each error code defines `code`, `http_status`, translated message, `retryable`, details schema, and request ID behavior. Initial codes include:

```text
AUTH_REQUIRED
TOKEN_EXPIRED
FORBIDDEN
RESOURCE_NOT_FOUND
RESOURCE_NOT_VISIBLE
RESOURCE_VERSION_NOT_PUBLISHED
RESOURCE_FILE_NOT_READY
DOWNLOAD_RATE_LIMITED
DELIVERY_TEMPORARILY_UNAVAILABLE
STORAGE_FAILURE
HASH_UNAVAILABLE
CLIENT_UPGRADE_REQUIRED
```

Clients use `code`, not a Chinese message string, to make decisions.

### 5.4 Idempotency

- `Idempotency-Key` is appropriate for resource creation, version creation, and publish commands.
- Favorite and Follow use naturally idempotent `PUT`/`DELETE` semantics.
- Token refresh follows OAuth lifecycle rules, not a generic idempotency wrapper.
- Download grant deduplication is defined by Download Policy only when business semantics justify it.

### 5.5 Capability discovery

`GET /api/v1/capabilities` exposes a small set of stable booleans and minimum/recommended client versions. It is not a general remote feature platform.

## 6. Stable identity, Web URLs, and Deep Links

### 6.1 IDs

- Existing integer `id` remains the database primary key, legacy API reference, and internal relation key.
- `public_id` is incremental and immutable for externally long-lived cross-client objects.
- `public_id` is not an authorization mechanism.

Initial candidates:

```text
Resource
ResourceVersion
ResourceFile
Media
Thread
Server
GameVersion
```

### 6.2 URL separation

```text
Stable Identity ≠ Canonical URL
```

Existing URLs remain compatible:

```text
/resources/{id}
/posts/{id}
```

Any future SEO URL form such as `/resources/{id}/{slug}` is a separate redirect/canonical task. It must not be coupled to client identity work.

### 6.3 Deep Links

```text
mdt://resource/{public_id}
mdt://thread/{public_id}
mdt://server/{public_id}
mdt://map/{public_id}
mdt://schematic/{public_id}
mdt://version/{public_id}
mdt://user/{public_id}
```

## 7. Community semantics

Current `posts` records act as root discussion topics. The V1 semantic model is:

```text
Legacy Post / posts table → V1 Thread
Legacy Reply / replies table → V1 Reply
```

No parallel `threads` table and no destructive table/entity rename is authorized now. V1 exposes:

```text
GET /api/v1/threads
GET /api/v1/threads/{thread_public_id}
GET /api/v1/threads/{thread_public_id}/replies
```

The internal migration from Post naming is deferred until real requirements justify it.

## 8. Resource aggregate

```text
Resource
├── ResourceAttribution[]
├── ResourceTagLink[]
├── ResourceVersion[]
│   ├── ResourceFile[]
│   ├── ResourceDependency[]
│   └── ResourceCompatibility[]
├── ResourceMediaLink[]
├── ResourceRating[]
├── ResourceComment[]
└── DownloadEvent[]
```

### 8.1 Resource

Retain `resources.id`, `user_id`, `title`, `slug`, `category_id`, `status`, `is_public`, `download_count`, timestamps, and soft-delete fields. Add incrementally:

```text
public_id
summary
resource_kind
visibility
homepage_url
source_url
license
latest_published_version_id
discussion_thread_id
metadata_json
```

Legacy mappings:

| Current field | Transitional source | V1 term |
|---|---|---|
| `description` | Legacy summary source | `summary` |
| `content` | Legacy body Markdown | `description_markdown` |
| `content_html` | Legacy rendered body | `description_html` |
| `resource_type=upload/external` | Legacy delivery type | not Resource kind |
| `version`, `file_*`, `mfl_*`, `external_url` | Legacy root release | Version + File projection |

`resource_kind` starts as a controlled string registry:

```text
mod
map
schematic
save
server_plugin
development_tool
texture_ui
other
```

### 8.2 Attribution

`resource_attributions` contains:

```text
id
resource_id
role                    original_author | maintainer | publisher | submitter | contributor
subject_type            local_user | external_person | external_project
user_id                 nullable
display_name            nullable
profile_url             nullable
source_url              nullable
sort_order
created_at
```

Historical `resources.user_id` is backfilled as `submitter` only. The migration must never label a historical uploader as an original author without authoritative data.

## 9. ResourceVersion

Extend the existing `resource_versions` table rather than creating a parallel version table:

```text
public_id
release_channel
status
release_notes_markdown
release_notes_html
published_at
created_by_user_id
reviewed_by_user_id
reviewed_at
reject_reason
is_legacy_root_release
```

Version statuses:

```text
draft
pending_review
published
rejected
withdrawn
archived
```

`resources.latest_published_version_id` uses a foreign key with `ON DELETE SET NULL`. Resource Application Service, not cascade behavior, selects the newest remaining published version whenever the current latest version is withdrawn or archived.

A synthetic internal backfill version such as `legacy-{resource_id}` is allowed for uniqueness only. V1 returns a separate display state so users see `版本未知` or `历史版本`, never an implementation identifier.

## 10. ResourceFile

Create `resource_files`:

```text
id
public_id
resource_version_id
role
delivery_mode
platform_key
architecture_key
package_type
display_name
original_filename
mime_type
size_bytes
hash_algorithm
content_hash
integrity_status
storage_backend
storage_key
provider_file_id
external_url
availability_status
sort_order
created_at
```

### 10.1 Artifact classification

| Field | Meaning | Examples |
|---|---|---|
| `platform_key` | Runtime platform/environment | `desktop-jvm`, `windows`, `android`, `linux`, `macos`, `server`, `platform-independent` |
| `architecture_key` | CPU/ABI limit | `x86_64`, `arm64-v8a`, `armeabi-v7a`, `any` |
| `package_type` | File/package form | `jar`, `apk`, `zip`, `msav`, `msch`, `archive`, `source`, `manifest` |

These are controlled, extensible registry keys, not irreversible database enums.

### 10.2 Integrity and installation

```text
integrity_status:
verified
unverified_legacy
failed
unavailable
```

New managed files require a verified SHA-256 before becoming client-installable. Legacy files with no recoverable hash remain Web-downloadable when existing visibility rules permit, but are returned as `unverified_legacy` and not silently treated as installable.

V1 computes and returns:

```text
downloadable
verifiable
installable
install_block_reason
```

These are policy-derived capabilities, not three independently mutable boolean columns.

## 11. Dependencies and compatibility

### 11.1 Dependencies

```text
resource_version_dependencies
├── resource_version_id
├── dependency_type          required | optional | incompatible
├── target_resource_id       nullable
├── external_identifier      nullable
├── version_constraint       nullable
├── notes
└── sort_order
```

Internal dependencies store only local `target_resource_id`; V1 resolves the target's `public_id`. External dependencies use `external_identifier`. No duplicate local ID/public ID pair is stored.

### 11.2 Minimum Mindustry version model

Before Resource Compatibility, define reusable `MindustryVersionValue` and `MindustryVersionComparator`. API values are strings, supporting forms including:

```text
159
159.1
159.7
```

The comparator owns parsing, comparison, series/channel behavior, and invalid-value handling. No module or client may compare builds with ad-hoc numeric conversion.

### 11.3 Compatibility records

```text
resource_version_compatibilities
├── resource_version_id
├── runtime
├── game_series
├── min_version_value
├── max_version_value
├── channel
├── platform_key
└── notes
```

A later GameVersion Domain may add `game_version_id`; current Resource work does not wait for that product.

## 12. Media, storage, and delivery

### 12.1 Media is not ResourceFile

`MediaAsset` represents display material such as cover images, screenshots, and Forge previews. `ResourceFile` represents downloadable/installed content. They share infrastructure but remain separate domains.

Create `media_assets` and `resource_media_links` for new resource cover/screenshot flows. Existing avatar URLs, public image URLs, Markdown images, and attachment paths remain compatible until selectively migrated.

### 12.2 Responsibilities

```text
Storage Provider
├── put
├── inspect
├── delete
├── read metadata
└── optional hash verification

Delivery Strategy
├── public redirect
├── signed URL
├── one-time token
├── controlled proxy
├── MFL redirect
└── external-link redirect
```

Candidate providers/strategies are Local, MFL, and future Object Storage. The design does not require all to be implemented immediately.

### 12.3 Delivery policy

| Policy | Delivery |
|---|---|
| Fully public immutable file | Record grant, then redirect to public CDN/MFL URL where permitted |
| Private/restricted file | Short-TTL signed URL, one-time token, or proxy |
| External URL | Validated external redirect; normally not installable |
| Managed local file | Controlled stream or short-lived delivery |
| Sensitive file | Shorter TTL and stronger audit/policy |

Controlled delivery is mandatory. Signed URLs are provider- and policy-dependent, not universal.

## 13. Download policy and statistics

### 13.1 V1 endpoints

Browser-compatible endpoint:

```text
GET /api/v1/resources/{resource_public_id}/versions/{version_public_id}/files/{file_public_id}/download
```

Client grant endpoint:

```text
POST /api/v1/resource-files/{file_public_id}/download-grants
```

### 13.2 Flow

```text
Request
  ↓
Resource Read Policy
  ↓
Version published?
  ↓
File ready and downloadable?
  ↓
Rate limit / access policy
  ↓
DownloadEvent(granted)
  ↓
Delivery Strategy
  ↓
Redirect / Stream / Token
```

Existing resource visibility, moderation, disabled-category, and ownership policy remains the source for access decisions.

### 13.3 Download facts and displayed count

`download_events` tracks `requested`, `granted`, `started`, `completed`, and `failed` with resource/version/file/client/platform/backend context.

Public download count means:

> An effective, deduplicated grant for actual file delivery authorization.

It does not claim that every redirected browser completed a download. Admin analytics distinguishes granted, started, completed, failed, unique users, platform, and client type.

Historical count is preserved as:

```text
legacy_download_baseline
+
v1_download_aggregate
=
public_download_count
```

Legacy data is marked unattributed rather than fabricated as historical version/platform/client detail.

## 14. Events, notifications, and search

### 14.1 Event introduction

Do not create a global outbox table in Phase 0 merely for governance. Define event rules first. Create `outbox_events` only when the first real cross-module event lands: `ResourceVersionPublished` updating Search, Notification, and cache state.

```text
MySQL transaction
        ↓
Outbox event
        ↓
Worker
        ↓
Notification DB / Search projection / Activity
        ↓
Redis Pub/Sub
        ↓
SSE fan-out
```

Redis Pub/Sub is real-time fan-out only, never the durable fact source.

### 14.2 Notification targets

Notification storage evolves with:

```text
event_key
target_type
target_id
payload_json
dedupe_key
read_at
```

A controlled Target Resolver produces `target_public_id`, `target_url`, and target state in V1 DTOs. Soft-deleted targets leave readable historic notifications with a deleted target state. Existing post/reply fields remain until Legacy APIs retire.

### 14.3 Search

Search indexes only public and discoverable objects. Unlisted, private, and moderator-only content stays outside public discovery. Search results never replace domain access-policy checks.

Chinese search must be benchmarked before selecting MySQL Full-Text, projection plus LIKE/prefix, or a later external search engine.

## 15. MindAuth and device authentication

### T-08A: capability audit

Before device schema changes, verify MindAuth's Authorization Code, PKCE, token model, refresh rotation, revoke, JWT/JWK, introspection, audience, client registration, and device/session management.

### Preferred Mode A

If MindAuth provides sufficient OAuth/OIDC capabilities:

```text
Windows / Android → MindAuth → Access Token → MDTBBS V1
```

MDTBBS validates the token, maps the local user, builds a principal, and applies business authorization. It does not issue an additional refresh token.

### Compatibility Mode B

Only if MindAuth cannot support the required lifecycle may MDTBBS create a first-party broker/device-session layer. MindAuth remains the sole identity source; MDTBBS never stores user passwords or becomes a second username/password system. Mode B requires its own ADR and security review.

## 16. Frontend, SSR, and UI

Public content stays server-first. Existing Resource and Thread SSR/metadata/canonical capabilities are retained and extended. Client API code is split by domain under `frontend/src/lib/api/v1/` instead of retaining a single growing endpoint registry.

UI delivery order:

```text
Resource Detail V1 UI
→ Unified Search UI
→ Discover
→ Portal/Homepage
```

Resource Detail V1 UI ships early and displays attribution, versions, files, integrity state, compatibility, and correct download behavior. Discover and Portal only aggregate domains after their DTOs stabilize.

The design system prioritizes high information density, clear hierarchy, list-first layouts, stable metadata, and shared loading/empty/error states. Large-card social-feed visuals are out of scope.

## 17. Revised roadmap

### P0-A: migration safety and contract

- Legacy Resource read-only audit;
- migration/backfill standards;
- V1 error contract and OpenAPI/JSON schema baseline;
- Application Service boundary;
- coarse global feature flags via existing Settings where sufficient;
- observability capability audit.

No default creation of a Feature Platform, Outbox table, or Backfill state table.

#### P0-A implementation evidence

- V1 JSON and raw-transport response behavior verified by Jest (12/12 focused tests).
- V1 error envelope and Legacy error compatibility verified by Jest.
- `GET /api/v1/capabilities` documented in the V1 OpenAPI document.
- Coarse V1 flags are stored in existing Settings keys; no feature-flag table was added.
- `npm run audit:resources` produced a read-only JSON report against the approved audit target.
- No Resource aggregate migration, Backfill mutation, Device Auth, Outbox, or Download Delivery code was included in P0-A.
- Full backend test suite: 588/588 passed, 0 failures.
- Backend build: clean (exit code 0).

### P0-B: resource core

- Resource, ResourceVersion, ResourceFile, Attribution;
- dependency declarations and compatibility records;
- Mindustry Version Comparator;
- Legacy backfill and adapter;
- Resource Detail V1 UI.

### P0-C: delivery

- Media minimum model;
- Storage Provider/Delivery Strategy boundary;
- Download Policy, grant, event, and legacy baseline;
- SHA-256 verification for new managed files;
- Web V1 download cutover.

Object Storage production migration is not a blocker if Local/MFL support the required policy.

### P0-D: client foundation

- MindAuth capability audit and auth ADR;
- Device Auth Adapter only after decision;
- basic resource publication event/notification contract;
- Client Contract Pilot.

### Phase 6.5: Client Contract Pilot

Validate only auth, Resource read, ResourceFile, download grant, hash, retry, weak network, Deep Link, basic notification, and V1 errors. It explicitly excludes Favorite, Server, Knowledge, Forge, Discover, Portal, and client GA.

### P1

- Thread V1;
- Resource Favorite/Subscription;
- Creator Profile;
- Unified Search;
- notification center improvements;
- Resource UI full cutover.

### P2

Independent tasks:

```text
GameVersion Domain
Server Domain
Knowledge Domain
Forge
Discover
Portal/Homepage
```

### Client GA

Only after the GA Gate below is met.

## 18. Task registry

| ID | Title | Priority | Depends on | User-visible outcome |
|---|---|---:|---|---|
| T-00 | Legacy Resource Migration Audit | P0-A | — | None; safe migration evidence |
| T-01 | V1 Contract and Application Boundary | P0-A | T-00 | V1 resource read trial |
| T-02 | MindustryVersionComparator | P0-B | T-01 | Correct compatibility display |
| T-03 | Resource Core Schema | P0-B | T-01, T-02 | Multi-file resource capability |
| T-04 | Backfill, Adapter, Legacy Projection | P0-B | T-00, T-03 | Historical resources retained |
| T-05 | Resource Detail V1 UI | P0-B | T-04 | New resource detail |
| T-06 | Media and Storage/Delivery Boundary | P0-C | T-03 | Cover/screenshot model |
| T-07 | Download Policy, Grant, Event, Baseline | P0-C | T-04, T-06 | Correct Web downloads/statistics |
| T-08A | MindAuth Capability Audit | P0-D | T-01 | Auth ADR |
| T-08B | Device Auth Adapter | P0-D | T-08A | Client principal |
| T-09 | Minimum Event/Notification Contract | P0-D | T-03, T-07 | Resource update notification |
| T-10 | Unified Search Core and UI | P1 | T-09 | Resource + Thread search |
| T-11 | Client Contract Pilot | P0-D | T-07, T-08B, T-09 | Internal client validation |
| T-12 | Community V1 and Creator | P1 | T-04, T-09 | Creator contribution/profile |
| T-13A | GameVersion Domain | P2 | T-02 | Version library |
| T-13B | Server Domain | P2 | T-01 | Server detail |
| T-13C | Knowledge Domain | P2 | T-10 | Knowledge detail |
| T-14 | Forge | P2 | T-06, T-09, T-13A | Preview pipeline |
| T-15A | Discover | P2 | T-10, T-12 | Discover page |
| T-15B | Portal/Homepage | P2 | T-13A, T-13B, T-13C, T-15A | Community portal |

For every task, the implementation plan must state: problem, target, modules, exact file list after repository re-check, migration, API compatibility, rollback/flag, risks, tests, acceptance criteria, priority, and dependencies.

## 19. Test strategy

Required layers:

- fresh/upgrade migration tests and rollback drills;
- Legacy Resource dirty-data fixtures;
- V1 OpenAPI/JSON schema snapshots;
- Legacy/V1 projection comparison;
- storage/delivery provider fakes;
- download visibility/rate-limit/redirect/stream/statistics tests;
- device authentication tests after the MindAuth ADR;
- outbox retry/deduplication/multi-instance notification tests;
- Chinese search benchmark and visibility tests;
- SSR/metadata/resource-detail/download E2E tests;
- Client fixture replay tests.

The Legacy Resource dirty-data matrix includes root-only files, Version-only files, collisions, MFL, external URLs, unavailable files, missing versions, empty versions, soft-deleted/pending/rejected resources, disabled categories, missing summaries, third-party images, and non-zero historical download counts.

## 20. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Historical Resource inconsistency | Audit first, dry-run backfill, idempotent checkpoints, reconciliation |
| MFL capability mismatch | Provider capability contract; no assumed signed URLs/version support |
| Duplicate business services | V1/Legacy share Application Services |
| Data drift from dual write | Minimize dual write; define end date and comparison job |
| Device auth becoming a second identity system | MindAuth audit and ADR before implementation |
| Redirect download overcount | Define public count as effective grant, not assumed completion |
| Search visibility leak | Search indexes discoverable data only; domain policy remains final authority |
| Event loss | Outbox for durable state; Redis Pub/Sub for fan-out only |
| Overbuilding | Each abstraction must be proven by Resource/Download/Client Pilot usage |
| Forge untrusted input | Worker isolation, limits, timeout, retry, and security review |

## 21. ADR list

- **ADR-001:** retain Modular Monolith and avoid a parallel rewrite.
- **ADR-002:** `/api/v1/*` is first-party; `/api/*` is Legacy Compatibility.
- **ADR-003:** `/api/external/v1/*` is Automation, not device auth.
- **ADR-004:** retain integer IDs; add public IDs only for cross-client identities.
- **ADR-005:** stable identity is independent from canonical Web URL.
- **ADR-006:** extend existing ResourceVersion and add ResourceFile.
- **ADR-007:** MediaAsset and ResourceFile are distinct domains.
- **ADR-008:** split Storage Provider from Delivery Strategy.
- **ADR-009:** public download count is effective granted delivery.
- **ADR-010:** preserve historical download baseline.
- **ADR-011:** new managed files require hash verification; legacy files support explicit unknown integrity.
- **ADR-012:** create Outbox only when the first real cross-module event requires it.
- **ADR-013:** Redis Pub/Sub is fan-out, not durable event truth.
- **ADR-014:** MindAuth capability audit precedes Device Auth implementation.
- **ADR-015:** run Client Contract Pilot before completing all domains.
- **ADR-016:** GameVersion, Server, and Knowledge are independent tasks.
- **ADR-017:** benchmark Chinese search before selecting index technology.

## 22. Open questions

1. **NEEDS VERIFICATION:** Does MindAuth support PKCE, token validation, JWK/introspection, revoke, refresh rotation, and device sessions?
2. **NEEDS VERIFICATION:** Can MFL provide short-lived delivery, access control, version-specific files, and reconciliation metadata?
3. **NEEDS VERIFICATION:** Does current MySQL support adequate Chinese Full-Text/ngram quality?
4. **NEEDS VERIFICATION:** Are global Settings flags sufficient, or is targeted/canary rollout required?
5. **NEEDS VERIFICATION:** Can current Redis/queue configuration support the planned worker/fan-out workload?
6. **NEEDS VERIFICATION:** What percentage of legacy local files, MFL entries, and external URLs are still accessible?
7. **NEEDS VERIFICATION:** Is there an existing repository-wide Request ID and structured logging convention suitable for migrations?
8. **NEEDS VERIFICATION:** Is there a reliable malware scanner, quarantine workflow, and operator process?
9. What retention policy applies to download facts, grants, devices, media, and soft-deleted content?
10. Is `unlisted` a current product requirement, or only a future capability?

## 23. Assumptions

1. MySQL is the system of record; Redis is not the only holder of irreversible business facts.
2. Current Resource/Post/User IDs remain valid compatibility anchors.
3. MFL remains an integration option during migration.
4. Web keeps Cookie Session during V1 rollout.
5. Resource moderation remains a core policy and cannot be bypassed by V1.
6. Disabled resource categories remain a public visibility boundary.
7. Object Storage is optional for Resource V1, not a current blocker.
8. Client auto-install only targets files explicitly returned as installable and verifiable.
9. Existing Web URL migration is not coupled to public ID migration.
10. Every implementation task re-verifies actual schema, APIs, and production data before editing.

## 24. NEEDS VERIFICATION register

| Item | Known now | Constraint before verification |
|---|---|---|
| MindAuth OAuth/OIDC | Web code-exchange flow exists | Do not implement Device Token schema |
| MFL delivery | Upload and approval sync exist | Do not promise signed URLs/revocation/version files |
| Chinese Full-Text | Current Search relies on LIKE | Do not pick an index provider |
| Settings flags | Global feature keys exist | Do not assume user/role/percentage rollout |
| Redis/Queue | Redis and email queue are used | Do not treat Pub/Sub as durable source |
| Legacy file integrity | Local/MFL/external legacy paths exist | Do not cut V1 delivery before audit |
| Request ID/logging | Partial/unknown repository-wide baseline | Do not create a new observability platform by default |
| Backfill state | No verified generic runner | Do not create a table until workflow needs persistence |
| Malware scan | No verified scanner baseline | Do not block every publish on scanning |
| Object storage | Local + MFL are current paths | Do not make it a V1 blocker |

## 25. Client Contract Pilot Gate

Before an internal Pilot:

- V1 JSON/raw response rules are implemented and tested.
- OpenAPI/JSON schemas and fixtures exist.
- Error codes and capability endpoint are stable.
- Resource, Version, and File have public IDs.
- File DTO exposes downloadable/verifiable/installable state.
- New managed files expose verified SHA-256; legacy unknown hashes are explicit.
- MindAuth capability audit is complete and a principal path is decided.
- Pilot does not use Web cookies, HTML, internal DB fields, or service API keys.
- V1 download grant/download behavior and error handling are tested.
- Basic notification facts remain readable from DB after realtime failure.

## 26. Client GA Gate

Before public Windows/Android GA:

- Device lifecycle, revocation, token auditing, and the selected authentication design are production-validated.
- V1 deprecation, versioning, compatibility fixtures, and capability policy are stable.
- Resource/Version/File/Hash/compatibility/download DTOs are stable.
- Download events, historical baselines, and aggregation are verified.
- Visibility and moderation cannot be bypassed through delivery paths.
- Backfill, reconciliation, and feature-flag cutover have production drills.
- Delivery, storage, outbox, and multi-instance notification failure metrics are observable.
- Client retry, weak-network, previous-version, and revoke behavior have automated coverage.

## 27. Final delivery sequence

```text
Contract
   ↓
Minimum real Resource domain
   ↓
Legacy audit and backfill
   ↓
Web consumes V1
   ↓
Small Client Contract Pilot
   ↓
Community and Search
   ↓
GameVersion / Server / Knowledge
   ↓
Forge
   ↓
Discover / Portal
   ↓
Client GA
```

Every new abstraction must prove itself through a real capability:

```text
ResourceFile                  → multi-file/multi-platform delivery
Storage + Delivery boundary   → Local/MFL download behavior
Media                         → resource cover/screenshot/preview
V1 contract                   → Resource Detail
Device Auth Adapter           → Client Pilot
Outbox                        → ResourceVersionPublished
Search document               → Resource + Thread search
Version Comparator            → Resource compatibility
```
