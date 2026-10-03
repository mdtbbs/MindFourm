# Cloud Saves V1

Cloud Saves stores private Mindustry save snapshots. The service validates declared file size and SHA-256 before creating an immutable snapshot; clients must not share save data or download addresses between users.

## Access and ownership

- Every operation belongs to the authenticated Forum user. A client cannot supply another user ID.
- Official and approved clients use MindAuth OAuth scopes: `game_content.saves.read`, `game_content.saves.write`, and `game_content.saves.delete`.
- A third-party client needs only the scopes required by its requested operations and must be approved in MindAuth.
- Keep Bearer tokens on Forum API requests. Do not log tokens or private save metadata.
- Responses use `Cache-Control: private, no-store`; save downloads are binary responses and are never CDN-cacheable.

## API paths

All JSON paths below are relative to `/api/v1`. Except for the binary body or response, send `Accept: application/json` and `Authorization: Bearer <access-token>`.

| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | `/game-saves?limit=20&cursor=...` | read | List the current user's slots |
| GET | `/game-saves/quota` | read | Read used bytes, quota, file limit, and slot count |
| POST | `/game-saves` | write | Create a slot |
| GET | `/game-saves/{slotId}` | read | Read slot metadata and current snapshot |
| PATCH | `/game-saves/{slotId}` | write | Rename a slot |
| DELETE | `/game-saves/{slotId}` | delete | Delete a slot and its snapshot references |
| GET | `/game-saves/{slotId}/snapshots` | read | List snapshot history |
| PATCH | `/game-saves/{slotId}/snapshots/{snapshotId}` | write | Pin or unpin a snapshot |
| DELETE | `/game-saves/{slotId}/snapshots/{snapshotId}` | delete | Delete an eligible historical snapshot |
| POST | `/game-saves/{slotId}/snapshots/{snapshotId}/restore` | write | Restore an old snapshot as a new revision |
| POST | `/game-saves/{slotId}/uploads` | write | Reserve quota and create an upload session |
| PUT | `/game-saves/uploads/{uploadId}/file` | write | Stream the save bytes to the Forum server |
| POST | `/game-saves/uploads/{uploadId}/commit` | write | Verify and commit the uploaded snapshot |
| DELETE | `/game-saves/uploads/{uploadId}` | write | Cancel an unfinished upload |
| POST | `/game-saves/{slotId}/snapshots/{snapshotId}/download` | read | Get the binary download path and metadata |
| GET | `/game-saves/{slotId}/snapshots/{snapshotId}/file` | read | Stream the private save file |

JSON responses use the V1 envelope `{ "data": ..., "meta": { "request_id": ... } }`. Binary download responses contain the file bytes directly.

## Upload flow

Hash the save file locally, then create a session with the expected size and SHA-256. The response supplies a Forum API path for the binary PUT. Use the same OAuth Bearer token on both requests.

```http
POST /api/v1/game-saves/{slotId}/uploads
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "sha256": "<64 lowercase hex characters>",
  "size": 1048576,
  "reason": "after_exit",
  "base_snapshot_id": "<current snapshot UUID>",
  "game": { "version": "v146", "build": 146 },
  "save": { "map_name": "Example", "wave": 42, "playtime_seconds": 3600 },
  "mods": []
}
```

The successful response includes:

```json
{
  "data": {
    "upload_id": "<upload UUID>",
    "upload": {
      "method": "PUT",
      "url": "/api/v1/game-saves/uploads/<upload UUID>/file",
      "headers": { "Content-Type": "application/octet-stream" },
      "expires_at": "<ISO 8601 timestamp>"
    }
  }
}
```

Stream the original file bytes to the returned path. Do not JSON-encode, compress, or alter the file between hashing and upload.

```http
PUT /api/v1/game-saves/uploads/{uploadId}/file
Authorization: Bearer <access-token>
Content-Type: application/octet-stream

<raw save bytes>
```

Then commit:

```http
POST /api/v1/game-saves/uploads/{uploadId}/commit
Authorization: Bearer <access-token>
Content-Type: application/json

{}
```

The server streams the local file again and verifies its exact byte count and SHA-256 before creating a snapshot. If an upload is interrupted, create a new session or retry the same upload before its expiry. A commit is idempotent when the same upload session has already committed.

## Download flow

Request the authorized download path, then GET that Forum API route with the same Bearer token. The second response is an `application/octet-stream` attachment with a safe `Content-Disposition` name.

```http
POST /api/v1/game-saves/{slotId}/snapshots/{snapshotId}/download
Authorization: Bearer <access-token>
Content-Type: application/json

{}
```

```json
{
  "data": {
    "download": {
      "method": "GET",
      "url": "/api/v1/game-saves/{slotId}/snapshots/{snapshotId}/file",
      "headers": {},
      "size": 1048576,
      "sha256": "<64 lowercase hex characters>",
      "file_name": "Example.msav"
    }
  }
}
```

The client should stream to a temporary file, verify size and SHA-256, preserve the existing local save, and only then replace it. The Forum verifies ownership again on the binary GET.

## Conflicts, deduplication, and retention

- Each slot has an immutable, monotonically increasing snapshot history. Restoring a snapshot creates a new revision.
- `base_snapshot_id` prevents a client from overwriting a newer cloud head. A conflict response reports the current snapshot ID.
- Supported conflict policies are `normal`, `create_conflict_copy`, and `force_replace_head`. Forced replacement must confirm the exact current snapshot ID.
- A repeated content hash for the same user shares one local blob, while quota counts that content once.
- The service reserves quota for pending uploads and uses row locks while committing. It rejects a file larger than either the configured per-file maximum or the user's remaining quota.
- Unpinned history is subject to the configured retention limit. Pinned snapshots are retained until explicitly unpinned or their slot is deleted.
- Deleted or unreferenced files are removed by the maintenance worker after its grace period.

## Availability

Check `GET /api/v1/capabilities` before enabling Cloud Saves in a client. The service may be disabled or its limits may change; treat the current quota response and stable error codes as authoritative. Administrative storage configuration is outside the Public Client API.

## Client requirements

- Treat slot, snapshot, and upload IDs as opaque values.
- Use the quota endpoint before starting large transfers. Limit concurrent transfers and show request IDs when reporting errors.
- Do not use usernames, save names, or client-provided paths as server file paths.
- Keep a verified local copy until the server confirms the snapshot commit.
- Do not parse or execute save or mod content on the Forum server.
- Deleting a cloud slot does not remove the user's local save file.
- After OAuth access is revoked, stop using the corresponding access token.

## Curl example

```sh
API_BASE=https://forum.example.com
ACCESS_TOKEN=replace-me
SLOT_ID=replace-me
SAVE_FILE=./save.msav
SHA256=$(sha256sum "$SAVE_FILE" | cut -d' ' -f1)
SIZE=$(wc -c < "$SAVE_FILE" | tr -d ' ')

curl --fail-with-body "$API_BASE/api/v1/game-saves/$SLOT_ID/uploads" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data "{\"sha256\":\"$SHA256\",\"size\":$SIZE,\"reason\":\"manual\"}"

# Read upload_id from the V1 response, then stream the file to:
curl --fail-with-body -X PUT "$API_BASE/api/v1/game-saves/uploads/$UPLOAD_ID/file" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/octet-stream' \
  --data-binary "@$SAVE_FILE"

curl --fail-with-body -X POST "$API_BASE/api/v1/game-saves/uploads/$UPLOAD_ID/commit" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' --data '{}'
```
