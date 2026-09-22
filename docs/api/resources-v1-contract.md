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
resource discussion/review APIs; the list card links to the same discussion
anchor, so a later comment-count field can be added without changing the card
contract.

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
