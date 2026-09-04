# MDTBBS Full Refactor — Cross-Session Handoff

**Created:** 2026-08-10  
**Status:** Overall design, first detailed phase plan, and full-program master plan are complete. No implementation code has been changed.

## Authoritative documents

1. **Architecture baseline — source of truth**  
   `docs/superpowers/specs/2026-08-10-mdtbbs-overall-refactor-design-v2.md`

2. **Single-entrypoint full-program execution plan**  
   `docs/superpowers/plans/2026-08-10-mdtbbs-full-refactor-master-execution.md`

3. **Detailed first implementation plan: P0-A**  
   `docs/superpowers/plans/2026-08-10-p0a-v1-contract-resource-audit.md`

## Approved strategy

```text
Modular Monolith
+ API First
+ incremental Strangler Migration
```

Keep the current NestJS, Next.js, MySQL, Redis, TypeORM migration system, existing IDs, existing Web URLs, and Legacy `/api/*` behavior. Do not create a parallel backend, rewrite the application, or extract microservices prematurely.

## How the receiving session should execute

1. Read the v2 specification first.
2. Treat the full-program master plan as the complete ordered roadmap.
3. Start by executing the detailed P0-A plan task by task with TDD and review checkpoints.
4. After P0-A, continue through the master plan's phases in order.
5. Before entering a gated phase, collect the required evidence; do not invent results for MindAuth, MFL, Chinese search, Redis/queue, or historical file integrity.
6. Create detailed sub-plans for later implementation slices only after their predecessor gates pass, while preserving the master plan's boundaries and ordering.

## Full program sequence

```text
P0-A: V1 transport contract + capability endpoint + read-only Resource audit
P0-B: Resource / Version / File schema + Comparator + Backfill + V1 read
P0-C: Media + Storage/Delivery boundary + Download Policy + statistics
P0-D: MindAuth decision + device principal + minimum durable resource event
Phase 6.5: Client Contract Pilot
P1: Thread V1 + Creator + Resource interactions + Unified Search
P2: GameVersion, Server, Knowledge, Forge, Discover, Portal
Client GA: only after the approved GA gate is satisfied
```

## Hard gates

```text
G0 — repository baseline and tests
G1 — Legacy Resource audit report
G2 — MindAuth auth capability decision
G3 — MFL delivery capability decision
G4 — Chinese search benchmark
G5 — Client Contract Pilot
G6 — Client GA readiness
```

A failure at a gate blocks only phases that depend on that evidence. Keep existing production behavior in place and document the result.

## Non-negotiable implementation rules

- Ordinary V1 JSON responses use `{ data, meta }`; V1 errors use `{ error, meta }`.
- Streams, redirects, SSE, binary media, and 204 responses bypass JSON success wrapping.
- Use existing `SettingsService` for coarse global flags before considering new flag infrastructure.
- The first Resource audit must be read-only and execute `SELECT` only.
- Do not add ResourceFile, Backfill writes, Outbox, Device Auth, Media, Download Grant, or Object Storage during P0-A.
- Do not force Web URL changes because `public_id` is introduced.
- Do not use public IDs as authorization.
- New managed installable files require verified SHA-256; Legacy unknown files remain explicitly `unverified_legacy` where Web compatibility requires it.
- ResourceFile is a deliverable artifact; MediaAsset is presentation media. They are not interchangeable.
- Redis Pub/Sub is realtime fan-out only; durable events require MySQL transaction + Outbox when the first real cross-module event needs it.
- Do not commit unless the user explicitly authorizes it.

## NEEDS VERIFICATION

```text
MindAuth PKCE/token/revoke/device capabilities
MFL controlled delivery, signed URL, and version-file support
MySQL Chinese Full-Text quality
Settings suitability beyond coarse global flags
Redis/queue capacity for durable worker/fan-out needs
Legacy Resource local/MFL/external file availability
Repository-wide structured logging/request-ID baseline
Virus scanner/quarantine operations
```

## Working-tree note

The repository contained unrelated untracked documentation before this planning work. This planning session added:

```text
docs/superpowers/specs/2026-08-10-mdtbbs-overall-refactor-design-v2.md
docs/superpowers/plans/2026-08-10-p0a-v1-contract-resource-audit.md
docs/superpowers/plans/2026-08-10-mdtbbs-full-refactor-master-execution.md
docs/superpowers/plans/2026-08-10-p0a-v1-contract-resource-audit-handoff.md
```

Review `git status --short` before staging. Do not include unrelated existing untracked files in any future commit.
