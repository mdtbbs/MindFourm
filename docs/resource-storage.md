# Forum ResourceStorage integration

`mdtbbs.cn` owns resource metadata, authorship, permissions, moderation, `ResourceVersion`, `ResourceFile`, `DownloadGrant`, and download statistics. `res.mdtbbs.cn` owns forum resource bytes and public/private delivery. `file.mdtbbs.cn` remains the existing Mindustry version and mirror download service; its role does not change.

## Configuration

Set `RES_ENABLED=true`, `RES_BASE_URL=https://res.mdtbbs.cn`, and `RES_API_KEY` on the forum backend. Optional request and upload timeouts are `RES_REQUEST_TIMEOUT_MS` (10 seconds by default) and `RES_UPLOAD_TIMEOUT_MS` (120 seconds by default). The service key stays server-side and must never enter browser responses or logs. In production, enabled RES requires a HTTPS base URL and API key. Missing or disabled RES makes new uploads fail clearly; historical backends still read normally.

## Direct upload and completion

The authenticated Public V1 Resource upload flow is `POST /api/v1/resources/uploads/init` followed by a browser `PUT` to the returned `res.mdtbbs.cn/upload/:sessionId` URL with only the short-lived upload token, then `POST /api/v1/resources/uploads/complete`. Init targets an existing pending `ResourceVersion` and requires the browser to provide a SHA-256 digest. This digest binds completion to the authorized upload context because RES v1 has no session-to-object lookup endpoint. Forum checks authentication, phone verification, OAuth scope, write permission, resource state, file type, size, and rate limits at init and completion. A hash match may deduplicate without a PUT. The browser's uploaded size, MIME, hash, and state are never trusted at completion: the forum fetches authenticated RES object metadata and accepts only a verified object consistent with the authorized upload context. Creating a brand-new Resource through this direct API requires first creating a pending resource/version; the existing multipart create contract currently accepts the file through the forum and uploads it to RES server-side.

The forum creates a pending `ResourceFile` with `storage_backend=res`, `provider_object_id=<RES public_id>`, `provider_binding_id=<binding id>`, `storage_key=sha256:<hash>`, and verified SHA-256 integrity. `provider_file_id` remains the historical numeric MFL identifier. RES bindings use `namespace=mindforum`, `owner_type=resource_file`, `owner_id=<ResourceFile public_id>`, initially with private visibility. Approval upserts the same binding to public before committing forum approval; rejection or temporary withdrawal makes it private. Permanent removal deletes the binding, leaving physical byte reclamation to RES GC.

## Downloads and preview

The forum still authorizes the download and records `DownloadGrant` and statistics. It then redirects (`302`) to `/o/<public_id>/<filename>` for a public RES file or to a short-lived `/private/<token>` URL created by the RES signed URL API for an authorized private file. The forum never proxies RES file bytes or Range requests. Renderer and other internal readers use the authenticated `GET /api/v1/objects/:id/content` endpoint with a size bound.

New renderer PNG previews are uploaded to RES after rendering and bound to the resource as `owner_type=resource_preview`. Pending previews remain private; approved previews receive a public binding and a direct RES URL. Legacy previews remain readable from the existing managed preview directory. Preview object and binding references are stored on `Resource` and `ResourceVersion` independently of `ResourceFile`; V2 version previews use distinct `resource_version_preview` bindings and follow version review visibility. Historical version PNG keys remain readable. New upload drafts also keep RES references in `ResourceUploadDraft`; preview routes authenticate the draft owner and redirect to short-lived private URLs. Consuming, deleting or expiring drafts removes their preview bindings. A failed binding cleanup is logged safely and can leave a private binding for later operational cleanup.

The `ResourceFileProviderService` uses a small backend switch for `res`, `managed`, `mfl`, and `external`. Existing managed files and external URLs keep their former access paths. MFL downloads use download-site metadata `file_path` to build current `/d/<path>` URLs, with a legacy URL fallback if metadata cannot be resolved.

## Historical migration

The administrator CLI is deliberately manual:

```bash
npm run resource-storage:migrate -- --dry-run --backend=managed --limit=100
npm run resource-storage:migrate -- --backend=managed --limit=100
npm run resource-storage:migrate -- --backend=mfl --resource-id=123 --limit=20
```

It handles files one by one: verify source bytes and SHA-256, upload or deduplicate in RES, confirm verified object metadata, create the binding, then update only that `ResourceFile` in a database transaction. It skips already migrated rows, records individual failures, and does not remove old local files. MFL migration requires that the existing download-site can serve the source bytes; inaccessible private or missing MFL files stay on their old backend and are reported as failures. Dry-run checks source bytes but does not write to RES or the forum database. Never run it automatically during deployment.

## Failure behavior

RES failure blocks new uploads and moderation changes that require a binding visibility update. Existing managed and MFL files remain available. A previously approved RES file can still receive a stable public redirect even if the forum cannot query RES metadata. Repair a failed operation by retrying it; do not publish a forum approval while its RES binding is private. No production migration or cleanup is part of the integration PR.

## Reconciliation

Administrators can run a read-only Forum↔RES reconciliation scan at `POST /api/admin/resources/storage/reconciliation/scan`. It compares Forum `resource_files` with the paginated RES object and `mindforum/resource_file` binding inventories, reporting missing objects/bindings, owner or binding drift, hash/size/MIME mismatch, object state, publication visibility, dangling files, and orphan objects/bindings. The report contains only public IDs and metadata; service keys, storage paths and signed URLs are never returned.

Repairs require both `repair=true` and `confirm=true`. Safe repairs mark a local file unavailable when the authoritative object is missing or inconsistent, or recreate the owner binding with the expected private/public visibility before updating the Forum row in a transaction. The operation never deletes an object or an unknown binding. Request and completion summaries are written to `operation_logs`; review the report before every repair. See [`resource-storage-reconciliation.md`](resource-storage-reconciliation.md) for the finding matrix and operator procedure.

## Schema migrations

`1720000290000` adds ResourceFile object/binding references and Resource preview references. `1720000300000` creates owner-bound direct upload contexts. `1720000310000` adds separate ResourceVersion and ResourceUploadDraft preview object/binding references. All have explicit down migrations; historic MFL integer IDs and PNG keys retain their meaning.
