# Resource API V1 contract

This contract is the shared read model for the web resource center, a future
launcher, and in-game clients. The legacy `/api/resources` endpoints remain
available for the current web application while clients migrate to `/api/v1`.

## Identity and compatibility

- `public_id` is the stable external identity of a resource, release, or file.
- Numeric database IDs are implementation details and must not be persisted by
  clients.
- Clients must ignore unknown response fields and must not assume that a
  resource kind has only one file.
- `resource_kind` is the content classification (`map`, `schematic`, `mod`,
  and future kinds); `resource_type` is the legacy delivery mode and is not
  part of client identity.
- Only approved, public resources and published releases are returned by the
  public V1 read API.

## Endpoints

```text
GET /api/v1/resources
GET /api/v1/resources/{resource_public_id}
GET /api/v1/resources/{resource_public_id}/preview
GET /api/v1/resources/{resource_public_id}/manifest
GET /api/v1/resources/{resource_public_id}/versions/{version_public_id}/files/{file_public_id}/download
```

The list endpoint uses `limit`, `offset`, and `q` during the compatibility
period. The manifest is the launcher/in-game synchronization boundary: it only
contains public UUIDs, published versions, compatibility, dependencies, file
hashes, and derived `downloadable`/`installable` capabilities. A client can
poll it without storing numeric database IDs.

Authenticated web interactions remain on the legacy resource route for now and
are additive:

```text
GET    /api/resources/{numeric_id}/like
POST   /api/resources/{numeric_id}/like
DELETE /api/resources/{numeric_id}/like
```

The like operation is idempotent. Comments continue to use the existing
resource discussion API. Legacy resource read responses may include the
additive `comment_count` field, which counts only visible public comments;
`rating_count`, `rating_sum`, and `rating_average` remain rating aggregates.
The V1 shape is unchanged.

## Resource detail shape

```json
{
  "public_id": "resource-uuid",
  "title": "Example",
  "summary": "Short description",
  "resource_kind": "map",
  "visibility": "public",
  "metadata": {
    "schema_version": 1,
    "tags": ["survival"],
    "supported_versions": ["v7"],
    "compatibility": ["desktop"],
    "preview": { "url": "/api/v1/resources/resource-uuid/preview", "status": "ready" },
    "map": {
      "width": 256,
      "height": 256,
      "planets": ["serpulo"],
      "game_modes": ["survival"]
    }
  },
  "latest_version": {
    "public_id": "version-uuid",
    "version": "1.0.0",
    "status": "published",
    "files": []
  }
}
```

The `metadata` object is versioned. Renderer-produced fields and
publisher-supplied fields are kept separate in storage; the API returns only
validated fields. Map, schematic, and mod details may grow independently
without changing the resource envelope.

## Manifest shape

The manifest is deliberately separate from the human-facing detail response:

```json
{
  "resource_public_id": "resource-uuid",
  "resource_kind": "mod",
  "versions": [{
    "public_id": "version-uuid",
    "version": "1.2.0",
    "release_channel": "stable",
    "compatibility": [{ "runtime": "mindustry", "game_series": "v7" }],
    "dependencies": [],
    "files": [{
      "public_id": "file-uuid",
      "platform": "android",
      "package_type": "jar",
      "hash_algorithm": "sha256",
      "content_hash": "...",
      "downloadable": true,
      "installable": true,
      "download_url": "/api/v1/resources/resource-uuid/versions/version-uuid/files/file-uuid/download"
    }]
  }]
}
```

`installable` is true only for an available, SHA-256-verified managed file.
The server never executes a Mod and does not treat publisher-supplied metadata
as a trust decision.

## Client safety rules

- Use the file hash and availability fields before installing a file.
- Treat missing metadata as unknown, never as a positive compatibility claim.
- Do not execute or inspect Mod code on the API server; Mod uploads are parsed
  as bounded archives and their manifest is treated as untrusted input.
- A failed preview must not make an approved original file appear unavailable.

## Resource kinds, topics, and compatibility provenance

`resource_kind` is the canonical content identity and comes from the shared
registry. Read the current registry instead of maintaining a client-side copy:

```text
GET /api/v1/resources/kinds
GET /api/v1/resources/topics
```

Kinds drive the primary resource navigation and submission type. Topics are
optional secondary use/category filters. During migration, the legacy
`category_id` query remains accepted as a topic filter; it does not change the
resource kind. The legacy `resource_type` continues to describe delivery
(`upload` or `external`) and is not a substitute for `resource_kind`.

Renderer facts and publisher declarations remain distinct. Compatibility rows
include their provenance and confidence when available (for example,
`file_metadata`, `inferred`, `user_declared`, `verified`, or `admin_verified`). A renderer build is
the parser runtime and must not be shown as the build stored in a map save.
Map metadata reports the stored game build only when the save contains it, and
reports the save format version separately. Schematic compatibility is an
inference from known content and format facts, not a promise that the blueprint
will load in every release.

## Duplicate detection and safe submission retries

The authenticated legacy web client may preflight a file or schematic through:

```text
POST /api/resources/duplicates/check
```

V1 upload clients receive the same duplicate findings from draft preview and
draft creation:

```text
POST /api/v1/resources/drafts/preview
POST /api/v1/resources/drafts
```

The result distinguishes an exact file SHA-256 match, an exact schematic
structure match, and a rotation/mirror-normalized schematic candidate. An exact
file match is a hard duplicate and final submission returns HTTP 409 with
`RESOURCE_DUPLICATE`. An exact schematic structure match requires a non-empty
`duplicate_note`, which is stored with the new resource for moderator review.
The normalized match is advisory and never blocks submission. Similar title or
source URL matches are also suggestions only.

Duplicate results only expose resources that the caller may see. A private or
pending match is returned as a generic match with no title, public ID, or
numeric ID. Clients must not use duplicate detection as an authorization or
visibility oracle.

For a final create or draft submit, clients may send an `Idempotency-Key`
header. Keys are scoped to the authenticated account and retained for 24 hours.
Retry the exact same request with the same key after a timeout to replay the
first result. Reusing a key with a different payload returns HTTP 409
`IDEMPOTENCY_KEY_REUSED`; a concurrent request with the same key can return
`IDEMPOTENCY_IN_PROGRESS`. A changed request must use a new key.

## Administrative duplicate merge

The web administration API provides a preview and an explicit merge action:

```text
GET  /api/resources/admin/{sourceId}/merge-preview?target_id={targetId}
POST /api/resources/admin/{sourceId}/merge
```

These numeric-ID routes are admin-only and are not part of public V1. Preview
reports relationships that can be transferred and version collisions. The
merge transaction transfers eligible history and associations to the target.
Non-colliding versions move intact. A colliding version never overwrites the
target; available attachments move as supplementary files only when both
versions are already published. Other colliding release records stay on the
source and their ID mapping is written to the merge audit. A legacy root file
or external link fills an empty target field. The merge records an audit entry
and keeps the source as a merged alias. Reads of the
source resolve to the canonical target. Duplicate discovery never merges or
deletes resources automatically; moderators must review and initiate a merge.
The legacy numeric resource route returns HTTP 301. A V1 detail lookup for a
merged `public_id` also returns HTTP 301 with a `Location` header and a body
containing `merged`, `canonical_public_id`, and `redirect_url`.

Historical duplicate groups can be inspected with
`npm run report:resource-duplicates` after applying the integrity migration.
The command is read-only, includes root resources and active version/file
hashes, reports exact and normalized schematic fingerprints, and never changes
or merges existing rows.
