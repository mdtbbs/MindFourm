# Cross-site resource transfer

MindFourm instances keep separate resource records, files, comments, ratings, favorites, download counts, moderation state, and databases. Resource transfer is a manual administrator action; it does not create a live federation link.

## Export

An administrator can export a JSON transfer manifest from the resource management table or call:

```http
GET /api/resources/admin/:id/export-manifest
```

The manifest uses `format: "mindustry-resource/v1"` and records the exporting site profile, stable resource ID, and source URL. It contains resource metadata, content language, license, source link, authors and maintainers, and compatibility declarations. For hosted files it includes the original file name and a source download URL, but does not embed the file bytes.

## Import

Open **Admin → Resources → Import resource**, select the manifest, and for hosted files download the source file and select the local copy. External-link resources keep their public HTTP(S) URL. The import request is administrator-only:

```http
POST /api/resources/admin/import
Content-Type: multipart/form-data

manifest=<JSON manifest>
file=<optional hosted resource file>
is_public=1|0
```

The destination runs the normal upload safety, file hashing, duplicate-resource, content-risk, and moderation paths. File bytes are written into destination storage. Source authors and maintainers remain attribution records; the importing administrator is the local submitter. A unique `(origin_site, origin_resource_id)` index prevents importing the same source resource twice. If an item needs another version, use the destination's regular version workflow and keep its existing source identity.

The destination keeps its own category assignment and all community activity. Transfer does not copy comments, ratings, favorites, downloads, approval decisions, or user accounts.
