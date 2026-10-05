# MDTBBS Resource Center V2 API

Resource Center V2 adds structured, version-aware read APIs and community workflows for Mods, schematics, and maps on the existing Resource aggregate. It does not introduce a second resource catalog. Existing V1 resource and Game Content response shapes remain supported.

## Compatibility and identifiers

- API base URL: `/api/v1` (the service is commonly mounted under `/api`, so a deployed URL looks like `/api/v1/...`).
- Existing `GET /resources/{id}`, `GET /resources/{id}/manifest`, and all existing `/game-content/*` operations retain their published V1 semantics.
- New type-specific manifests are V2 aggregates at `/resources/mods/{id}/manifest`, `/resources/schematics/{id}/manifest`, and `/resources/maps/{id}/manifest`.
- Public resource, version, file, Mod Content, and report objects use `public_id` UUIDs. Internal database IDs are not API fields. Cursor values are opaque; clients must not decode them.
- Successful JSON responses use the standard V1 envelope: `{ "data": ..., "meta": { "request_id": "..." } }`. Errors use `{ "error": { "code", "message", "retryable", "details", "documentation_url" }, "meta": { "request_id" } }`.
- Public reads are anonymous. If a MindAuth Bearer token is supplied, it must include `resource.read`. Read routes currently declare a limit of 60 requests per 60 seconds.
- Paginated list endpoints default to `limit=20`, accept `1..100`, and return `data.items` plus `data.pagination.next_cursor` and `data.pagination.has_more`. Pass `next_cursor` unchanged to fetch the next page.
- `version_public_id` selects a published version. When omitted, the recommended published version is selected, falling back to the latest published version. Endpoints return empty lists, `null`, or `status: unavailable` when structured data has not been produced.

## Common resource reads

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/resources/{id}` | Existing V1 resource detail compatibility projection; its response shape is unchanged |
| GET | `/resources/{id}/manifest` | Existing V1 common manifest compatibility projection; its response shape is unchanged |
| GET | `/resources/{id}/versions` | Paginate published versions with files, compatibility and dependencies |
| GET | `/resources/{id}/relations` | Paginate related public resources |
| GET | `/resources/{id}/stats` | Read views, downloads, likes, favorites and ratings |
| GET | `/resources/{id}/workbench` | Read a safe, owner-aware workbench projection |
| GET | `/resources/{id}/versions/{versionId}/preview` | Read a published version's PNG preview |

The established `GET /resources/{id}` detail and `GET /resources/{id}/manifest` remain their original V1 DTOs. Type-specific V2 manifests are additive at `/resources/mods/{id}/manifest`, `/resources/schematics/{id}/manifest`, and `/resources/maps/{id}/manifest`. The workbench DTO includes:

```json
{
  "resource": {
    "public_id": "4ab5d671-8af6-4d16-8238-7b6fd4b0a240",
    "resource_kind": "map",
    "title": "Example map",
    "summary": null,
    "source_url": null,
    "license": null,
    "renderer": { "status": "ready", "parser_version": "1.0", "public_metadata": {}, "preview_url": null }
  },
  "permissions": { "role": "viewer", "can_manage": false },
  "versions": [],
  "analysis": null,
  "relations": [],
  "stats": { "views": 0, "downloads": 0, "likes": 0, "favorites": 0, "rating_count": 0, "rating_average": 0 }
}
```

`role` is `owner`, `maintainer`, `publisher`, `admin`, `moderator`, `viewer`, or `null`. Private resources are returned only to an active member, owner, admin, or moderator; moderators can inspect pending versions but do not receive collaborator edit permissions. For public resources a non-manager sees `viewer`. The projection excludes storage keys, raw private metadata, and numeric database identifiers. Relation items include `relation_type`, `relation_direction`, a non-null `relation_context`, and the related resource's `version_public_id` and `version` label when a published version is linked. `recommended_for` uses `opening`, `production`, `defense`, `logistics`, or `general` to identify its subtype.

Each `versions[]` item uses public UUIDs and contains `version`, `display_version`, `version_mode`, `revision`, `release_channel`, `recommended`, game-version bounds, publication state, `preview_url`, `compatibility[]`, `dependencies[]`, and `files[]`. `preview_url` is either a version preview route or the resource preview fallback; storage keys are never returned. The version preview route returns raw `image/png` bytes, uses the version's validated preview key when present, and otherwise tries the current resource preview. Files include SHA-256 only when the stored hash algorithm is SHA-256. `download_url` is the stable V1 download route; `downloadable` and `installable` reflect current file availability and integrity checks.

## Mod reads

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/resources/mods/{id}` | Mod profile and resource summary |
| GET | `/resources/mods/{id}/versions` | Published Mod versions |
| GET | `/resources/mods/{id}/manifest` | Aggregate V2 Mod manifest |
| GET | `/resources/mods/{modId}/resolve` | Resolve a canonical Mod ID, historical alias, or Resource UUID |
| GET | `/resources/mods/{id}/contents` | Paginate one version's indexed content |
| GET | `/resources/mods/{id}/localizations` | Localization coverage for one version |
| GET | `/resources/mods/{id}/dependencies` | Paginate direct dependencies for one version |
| GET | `/resources/mods/{id}/dependency-resolution` | Resolve a bounded dependency tree, including unresolved entries and cycles |
| GET | `/resources/mods/{id}/issue-reports` | Paginate public issue reports and author responses, without attachment metadata |
| GET | `/resources/mods/{id}/compatibility` | Compatibility records and public reports for one version |
| GET | `/resources/mods/{id}/conflicts` | Public conflict reports involving the Mod |
| GET | `/resources/mods/{id}/relations` | Public related resources |
| GET | `/resources/mods/{id}/analysis` | Static analysis findings and ignore metadata |
| GET | `/resources/mods/{id}/diff` | Stored version diff, or `diff: null` when unavailable |

For all version-scoped reads, `version_public_id` is optional. A Content entry has its own UUID and includes `content_type`, `internal_name`, safe `properties`, owning resource summary, and `version_public_id`. Private icon keys are not converted into URLs; `icon_url` is `null` unless a verified public asset URL exists.

`GET /resources/mods/{modId}/resolve` accepts a Mod ID or alias in the path, not only a UUID. It returns the canonical Mod ID, current resource public UUID, and registered aliases. Mod ID and Resource UUID remain separate identities.

`GET /resources/mods/{id}/dependency-resolution` accepts an optional `version_public_id` UUID to select a published release; when omitted it uses the recommended or latest published release. `max_depth` is an integer from 1 to 12 (default 12), and `max_nodes` is an integer from 1 to 200 (default 200). The resolver reads public dependency metadata only; it does not download or execute Mod code. The response includes `direct` and nested `tree` entries, an `unresolved` list for dependencies not found in the public catalog, `cycles` containing detected dependency paths, `warnings`, and `truncated`. A node may have status `unresolved`, `cycle`, or `limit_reached` (among other resolution statuses). `truncated: true` means depth, node, or per-release dependency limits prevented complete traversal; inspect `warnings` for the reason. The route is anonymous-readable, allows optional Bearer with `resource.read`, and is rate-limited to 30 requests per 60 seconds.

`GET /resources/mods/{id}/issue-reports` accepts optional `version_public_id` (published version UUID), `cursor`, and `limit` (default 20, maximum 100). It returns public report UUIDs, version UUIDs, status, title/body, author response fields, fixed version UUID, and creation time. Attachments and attachment metadata are omitted from the public response. The cursor is opaque; pass `next_cursor` unchanged. This route is anonymous-readable, allows optional Bearer with `resource.read`, and is rate-limited to 60 requests per 60 seconds.

## Schematic reads

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/resources/schematics/{id}` | Resource and selected-version dimensions/hash summary |
| GET | `/resources/schematics/{id}/versions` | Published schematic versions |
| GET | `/resources/schematics/{id}/manifest` | Aggregate V2 schematic manifest |
| GET | `/resources/schematics/{id}/analysis` | Analysis status, findings, parser and estimates |
| GET | `/resources/schematics/{id}/blocks` | Paginated block counts and any retained positions |
| GET | `/resources/schematics/{id}/materials` | Paginated construction materials |
| GET | `/resources/schematics/{id}/production` | Production summary with an explicit `estimated` marker |
| GET | `/resources/schematics/{id}/logic` | Static processor links and variables; logic is never executed |
| GET | `/resources/schematics/{id}/dependencies` | Version dependencies |
| GET | `/resources/schematics/{id}/relations` | Public related resources |
| GET | `/resources/schematics/{id}/diff` | Stored version diff or an unavailable result |

Block positions may be empty if the parser did not preserve coordinates. The API does not invent inspection detail. Production is theoretical/estimated data, never a measured gameplay result. The workbench includes an owner/maintainer light editor for rotate, mirror, selected-block deletion, official `.msch` export, and reanalysis. It fails closed on unknown content that could be lost by the bundled reader. The original published file is never modified; export creates a new file for the normal release flow.

## Map reads

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/resources/maps/{id}` | Resource and selected-version map metadata, including public core coordinates |
| GET | `/resources/maps/{id}/versions` | Published map versions |
| GET | `/resources/maps/{id}/manifest` | Aggregate V2 map manifest |
| GET | `/resources/maps/{id}/analysis` | Estimated difficulty, resource balance and path analysis |
| GET | `/resources/maps/{id}/rules` | World rules, or `rules: null` when absent |
| GET | `/resources/maps/{id}/resources` | Resource distribution summary |
| GET | `/resources/maps/{id}/waves` | Wave ranges, counts, estimated health, air ratio, bosses and spike markers |
| GET | `/resources/maps/{id}/spawns` | Public spawn coordinates |
| GET | `/resources/maps/{id}/dependencies` | Version dependencies |
| GET | `/resources/maps/{id}/relations` | Public related resources |
| GET | `/resources/maps/{id}/diff` | Stored version diff or an unavailable result |

Map difficulty and wave strength are estimates. Missing rules, resource entries, spawns, waves, or analysis are represented as `null` or empty lists rather than inferred. Map and wave editing are not exposed by these GET routes.

## Review timeline and annotations

| Method | Path | Access and behavior | Limit |
| --- | --- | --- | --- |
| GET | `/resources/{id}/review-events` | Requires `resource.read`; Resource owner, active Maintainer/Publisher, admin, or moderator. Optional version UUID filter; offset pagination. | 60 / 60s |
| POST | `/resources/{id}/versions/{versionId}/review` | Moderator/admin; approves, rejects, or requests changes for a `pending_review` version. Approval publishes only that version and updates the latest pointer; stable `release` approvals replace the single recommendation. | 20 / 60s |
| POST | `/resources/{id}/versions/{versionId}/analysis/overrides` | Requires `resource.upload`; Owner/Maintainer may ignore an existing `ERROR` or `WARNING` finding with a reason. | 20 / 60s |
| DELETE | `/resources/{id}/versions/{versionId}/analysis/overrides` | Requires `resource.upload`; Owner/Maintainer clears an ignore by `finding_key`; the clear is also recorded in the timeline. | 20 / 60s |
| POST | `/resources/{id}/review-annotations` | Requires `resource.upload`; admin/moderator adds a field annotation, optionally scoped to a version UUID. | 30 / 60s |

The review timeline accepts optional `version_public_id` (UUID), `limit` (default 50, range 1–100), and `offset` (default 0, range 0–100,000). Its response contains `items` and `{ pagination: { limit, offset, has_more } }`. Events include public Resource/version UUIDs, event type/result/reason, finding key or field annotation, actor, timestamp, and parser version. No database numeric IDs are returned.

Approving a file-backed version verifies its quarantine path, size, and SHA-256, then prepares a copy in published storage while retaining the quarantine source. The version, ResourceFile key, Resource latest-version pointer, review event, and operation log commit in one database transaction. The quarantine source is removed only after commit; a cleanup failure is logged and leaves an orphan for the existing quarantine cleanup job. If the database transaction rolls back, the source remains available for retry. An identical same-name target from an earlier prepare is reused; a different-content collision fails without overwriting the existing file. The transaction locks and rechecks the version state, so concurrent approvals produce at most one review event, operation log, and notification. Reject and request-changes actions leave the file quarantined.

Override requests require `finding_key` and `reason` (up to 5,000 characters); only existing ERROR/WARNING findings may be ignored. The original analyzer finding remains intact, and each ignore records its reason, actor, timestamp, and parser version. DELETE accepts `finding_key` and an optional reason. Annotation requests accept optional `version_public_id`, a `field_path` (up to 191 characters), severity `ERROR`, `WARNING`, or `INFO`, and a body (up to 20,000 characters). The annotation and its review timeline event retain the actor, timestamp, and applicable parser version.

## GitHub Release source

| Method | Path | Access and behavior | Limit |
| --- | --- | --- | --- |
| PUT | `/resources/{id}/source-sync/github` | Requires `resource.upload`; Owner/Maintainer configures an HTTPS GitHub repository and release/asset filters. | 10 / 60s |
| GET | `/resources/{id}/source-sync/github/releases` | Reads releases, README, and License previews for a public Mod with an enabled source; anonymous, optional Bearer requires `resource.read`. | 12 / 60s |
| POST | `/resources/{id}/source-sync/github/import` | Requires `resource.upload`; Owner/Maintainer explicitly imports one selected release asset into quarantine and the normal immutable version/revision flow. | 5 / 60s |

Setting `enabled=true` opts the source into a bounded background poll, at most once every 15 minutes. Each poll processes at most one eligible release per Mod, oldest-to-newest after the imported baseline; first opt-in imports only the newest eligible release. Stable releases are included by default. To include prereleases, set `stable_only=false` and `include_prerelease=true`. Asset include/exclude filters apply to automatic selection; automatic import pauses for manual confirmation if more than one asset matches. Disabling automation leaves the explicit release-list and import routes available.

The poll compares the selected upstream asset SHA-256 with the imported version. If an already imported tag disappears, stops matching the filters, has ambiguous assets, cannot be verified, or points to different bytes, automation is disabled and the Resource owner is notified. It never overwrites the existing file or creates a replacement revision in that case. Temporary upstream/network errors keep automation enabled and retry on a later poll. Automatic imports still use the existing quarantine, archive validation, analysis, and immutable version/revision path; every imported binary remains `pending_review` until a moderator or admin approves that version, and the owner is notified. No Resource metadata is silently rewritten. `repository_url` must be an HTTPS `github.com` URL (maximum 500 characters). Optional `stable_only` defaults to `true`; `include_prerelease` defaults to `false`. `asset_include` and `asset_exclude` each accept at most 50 name patterns, each 1–255 characters. The manual releases query accepts `limit` from 1 to 30 (default 20). Manual import selects a release using `tag_name` (maximum 50 characters) and `asset_name` (maximum 255 characters). Resource and created version identifiers are public UUIDs. Invalid input returns 400, access failures 401/403, unavailable resources/releases 404, and upstream/download failures 502.

## Community feedback and Mod reports

These operations are additive to the Resource V2 reads. Resource and version path parameters, report identifiers, and referenced versions are public UUIDs. Successful JSON responses use the V1 `{ data, meta }` envelope.

| Method | Path | Access and behavior | Limit |
| --- | --- | --- | --- |
| GET | `/resources/maps/{id}/versions/{versionId}/feedback` | Public aggregate for a published map version; anonymous, optional Bearer requires `resource.read` | 60 / 60s |
| POST | `/resources/maps/{id}/versions/{versionId}/feedback` | Upsert the current user's feedback; requires `resource.upload`, sign-in, and verified phone number. One entry per user and version. | 10 / 60s |
| POST | `/resources/mods/{id}/versions/{versionId}/compatibility-reports` | Create or update the current user's compatibility report for a published Mod release; requires `resource.upload` and verified phone number. | 10 / 60s |
| PUT | `/resources/mods/compatibility-reports/{reportId}` | Update the caller's report; requires `resource.upload` and verified phone number. | 20 / 60s |
| POST | `/resources/mods/{id}/versions/{versionId}/issue-reports` | Submit an issue report for a published Mod release; requires `resource.upload` and verified phone number. Repeated submissions by the same account for the same release upsert the existing report, preserving its public UUID and status. | 10 / 60s |
| PUT | `/resources/mods/issue-reports/{reportId}` | Update the caller's issue report; requires `resource.upload` and verified phone number. | 20 / 60s |
| POST | `/resources/mods/compatibility-reports/{reportId}/author-response` | Owner or Maintainer responds to a compatibility report; requires `resource.upload`. | 20 / 60s |
| POST | `/resources/mods/issue-reports/{reportId}/author-response` | Owner or Maintainer responds to an issue report; requires `resource.upload`. | 20 / 60s |
| POST | `/resources/mods/issue-reports/{reportId}/attachments` | The report author uploads one private evidence file; requires `resource.upload` and verified phone number. | 10 / 60s |
| GET | `/resources/mods/issue-reports/{reportId}/attachments` | The report author, related Mod Owner/Maintainer/Publisher, admin, or moderator lists private attachment metadata; requires `resource.read`. | 60 / 60s |
| GET | `/resources/mods/issue-reports/{reportId}/attachments/{attachmentId}` | An authorized report participant downloads private binary evidence; requires `resource.read`. | 30 / 60s |
| DELETE | `/resources/mods/issue-reports/{reportId}/attachments/{attachmentId}` | The report author deletes an attachment; requires `resource.upload`. | 10 / 60s |
| POST | `/resources/mods/compatibility-reports/{reportId}/attachments` | The report author uploads one private evidence file; requires `resource.upload` and verified phone number. | 10 / 60s |
| GET | `/resources/mods/compatibility-reports/{reportId}/attachments` | The report author, related Mod Owner/Maintainer/Publisher, admin, or moderator lists private attachment metadata; requires `resource.read`. | 60 / 60s |
| GET | `/resources/mods/compatibility-reports/{reportId}/attachments/{attachmentId}` | An authorized report participant downloads private binary evidence; requires `resource.read`. | 30 / 60s |
| DELETE | `/resources/mods/compatibility-reports/{reportId}/attachments/{attachmentId}` | The report author deletes an attachment; requires `resource.upload`. | 10 / 60s |
| POST | `/resources/mods/conflicts` | Submit a conflict report with 2–10 distinct published Mod/version pairs; starts as `unverified`; requires `resource.upload` and verified phone number. | 10 / 60s |
| POST | `/resources/mods/conflicts/{reportId}/author-response` | Owner or Maintainer of an involved Mod responds; requires `resource.upload`. | 20 / 60s |

The map aggregate contains only `feedback_count` and the nullable averages `difficulty_average`, `resource_sufficiency_average`, `balance_average`, and `multiplayer_experience_average`. It never returns individual feedback. Each rating submitted to the POST route is an integer from 1 to 5; `body` is optional and limited to 5,000 characters. At least one rating or a body is required. Empty averages are `null`.

```json
{
  "data": {
    "resource_public_id": "4ab5d671-8af6-4d16-8238-7b6fd4b0a240",
    "version_public_id": "16d81bd0-90c7-48ed-a371-a81059aaddc9",
    "aggregate": {
      "feedback_count": 0,
      "difficulty_average": null,
      "resource_sufficiency_average": null,
      "balance_average": null,
      "multiplayer_experience_average": null
    }
  },
  "meta": { "request_id": "..." }
}
```

Compatibility reports accept `working`, `partial`, `cannot_start`, `crash`, `performance`, or `multiplayer`. New issue reports start as `open`; the unique account/release key makes repeated submission an idempotent upsert, updating report content without creating another report or changing its public UUID/status. Authors may respond with `confirmed`, `cannot_reproduce`, `fixed`, or `not_mod_issue`; `fixed` must reference a published version UUID. Conflict reports accept optional game-version bounds and details. A conflict response with `fixed` must identify the involved Mod and a published version UUID.

Binary evidence uses the report-specific attachment routes above. V2 report create/update requests do not accept client-declared attachment metadata; the private `mod_report_attachments` rows created by the upload endpoint are the sole source for the V2 attachment list. The legacy `attachment_json` columns remain for old data and legacy readers, but V2 does not write them. Uploads accept PNG/JPEG/GIF/WebP images or UTF-8 TXT/LOG/JSON/CRASH logs, with a 5 MiB per-file limit, 10 files per report, and 20 MiB total per report. Image signatures and safe dimensions are checked; log files must be valid UTF-8 text without NUL bytes. Upload and delete are limited to the report author; upload also requires verified phone number. Files stay in private quarantine storage. Reads require `resource.read` and are limited to the report author, the related Resource Owner or active Owner/Maintainer/Publisher, and admins/moderators. Attachment list entries include `can_delete`, which is true only for the report author. Public report projections continue to omit attachment metadata and binary contents. JSON routes use public UUIDs and the V1 `{ data, meta }` envelope; the authenticated download route returns raw bytes with `Content-Disposition: attachment`, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`. Remove IP addresses, tokens, usernames, local paths, and other private data from evidence before uploading. Requests return 400 for invalid identifiers/file types/per-report limits, 401 for missing authentication, 403 for missing scope/phone verification, 404 for missing or unreadable reports/attachments, and 413 when a file exceeds 5 MiB.

## Mod Content index

The versioned Content index uses the existing Game Content API prefix:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/game-content/content/search?q={term}&type={type}` | Search public Content rows across published Mod versions |
| GET | `/game-content/content/{contentPublicId}` | Read one Content item by UUID |
| GET | `/game-content/content/by-name/{type}/{internalName}` | Resolve a current name or a registered rename alias |

Search requires a non-empty `q` of at most 255 characters. `type` is optional and at most 50 characters. Search and by-name results use cursor pagination. By-name queries may return matching entries from several public resources or historical versions. Existing `/game-content/blueprints`, `/maps`, upload, preview, download, like, and favorite APIs retain their earlier semantics.

## Capabilities and unsupported editors

`GET /api/v1/capabilities` includes `resource_mod_workbench`, `resource_schematic_workbench`, `resource_map_workbench`, `resource_versions_v2`, `resource_relations_v1`, `mod_content_index`, `mod_dependency_resolver`, `mod_compatibility_reports`, `schematic_deep_analysis`, `schematic_light_editor`, `map_deep_analysis`, and `map_wave_viewer`. The light editor implementation is present, but `schematic_light_editor` remains `false` until the bundled renderer runtime and export round trip can be verified in the target environment. Full schematic editing, map editing, and wave editing remain explicitly unsupported: `schematic_full_editor=false`, `map_editor=false`, `wave_editor=false`.

The owner-aware map workbench includes a wave viewer sourced from the selected version's structured `analysis.data.waves` rows, with renderer wave groups as a fallback. It displays available enemy counts, estimated health, air ratio, boss counts, strength, and heuristic spike markers; null analysis values stay unavailable. The schematic preview supports click inspection and name-classified logistics, liquid, power, and input/output marker filters. The renderer emits bounded terrain, resource, ore, core, enemy-spawn, building, and liquid tile layers, and marks the layer payload when coordinate arrays are truncated. The `player_area` layer is currently empty because map files do not provide a defined player-area boundary. Target runtime verification is still required for the new renderer metadata projection.

## Owner and collaborator writes

These owner/collaborator routes use the same Resource aggregate and public UUIDs. They require the `resource.upload` OAuth scope and enforce resource membership roles in the service:

| Method | Path | Permission and behavior |
| --- | --- | --- |
| POST | `/resources/{id}/versions/analyze` | Owner, maintainer, or publisher; multipart dry-run parse. Mod archives are inspected statically and never executed; map/blueprint previews use the existing renderer. Limit: 5 requests per 60 seconds. |
| POST | `/resources/{id}/versions` | Owner, maintainer, or publisher; multipart upload enters `pending_review`. Re-uploading a version string creates a new revision instead of overwriting an existing file. Limit: 5 requests per 60 seconds. |
| POST | `/resources/{id}/versions/{versionId}/schematic-editor/export` | Owner or maintainer; transforms one published schematic, returns an official `.msch` copy, and leaves the source version immutable. Limit: 5 / 60s. |
| PATCH | `/resources/{id}` | Owner or maintainer; update title, description, content, source URL, or license. Changing source URL or license on an approved resource marks it pending review. |
| POST | `/resources/{id}/relations` | Owner or maintainer; create `recommended_for`, `fork_of`, `successor_of`, `related`, `requires`, or `compatible_with` relations using public UUIDs. Fork/successor relations require the same resource kind and a published target version UUID. |
| POST | `/resources/{id}/members` | Owner or maintainer; invite a collaborator by username. Maintainers may grant publisher role only. |
| POST | `/resources/{id}/members/respond` | Invited user accepts or rejects. Ownership transfer completes only after the recipient accepts. |
| POST | `/resources/{id}/owner-transfer` | Current owner or administrator starts a transfer invitation; the recipient must accept it. |

The write responses use the normal V1 JSON envelope. The public OpenAPI document includes request-body definitions, operation IDs, OAuth scopes, rate limits, and operation-specific error descriptions; response result fields are summarized above and are not currently represented by dedicated response schemas.

## Errors and OpenAPI

All routes are documented in the public V1 OpenAPI export with operation IDs, success DTO/envelope examples, optional `resource.read` bearer-scope metadata, rate limits, and standard 400/401/404 error responses. Clients should branch on `error.code`, not the localized message. `INVALID_CURSOR` means the opaque cursor is malformed or stale; `RESOURCE_NOT_FOUND` also covers private or type-mismatched resources so the API does not reveal their existence.

The established V1 resource detail, manifest, and Game Content endpoints keep their earlier response semantics. The routes above are additive V2 operations.
