# 论坛内置地图与蓝图预览

MindFourm owns map (`.msav`) and schematic (`.msch`) preview generation.  The
NestJS process owns authorization and public image delivery; the Java renderer
is a local, unprivileged parser process and must never be exposed through the
reverse proxy.

## Build

The worker source is in `tools/mindustry-renderer`. It builds against the
official Mindustry v160.5 server runtime by default (`-PmindustryVersion` can
select another compatible official release).

Schematic previews use Mindustry's generated block icon composition from the
official desktop atlas, including the generated `block-*-full` region when it
exists. The fallback composes the block's `getGeneratedIcons()` regions in
their official order. Map previews use v160.5 `MapIO.generatePreview(Map)`,
which reads the saved `preview_map` region and combines floor, overlay, solid
block, and building team-color layers without needing a loaded global world.

```bash
cd tools/mindustry-renderer
gradle clean build copyMindustryRuntime
```

The production host needs Java 17 or newer.  Do not copy a game client, load
mods, or give the worker write access outside the preview root.

## Process boundary

Create a dedicated OS account with a 512 MB memory limit, one CPU, no network
egress, and a filesystem view limited to the preview root.  The worker binds
to `127.0.0.1:6100`; firewall it from every other host.

```ini
# /etc/systemd/system/mindfourm-renderer.service
[Service]
User=mindfourm-renderer
WorkingDirectory=/data/www/MindFourm/tools/mindustry-renderer
Environment=STORAGE_ROOT=/data/mindfourm/uploads/previews
Environment=WORKER_TOKEN=replace-with-a-secret
Environment=WORKER_HOST=127.0.0.1
Environment=WORKER_PORT=6100
ExecStart=/usr/bin/java -Xmx512m -cp build/libs/mindfourm-mindustry-renderer-0.1.0.jar:build/libs/mindustry-server-v160.5.jar cn.mdtbbs.renderer.MapRenderer
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/data/mindfourm/uploads/previews
```

The forum environment must use the same root:

```dotenv
RESOURCE_RENDERER_URL=http://127.0.0.1:6100
RESOURCE_RENDERER_TOKEN=replace-with-the-same-secret
RESOURCE_PREVIEW_ROOT=/data/mindfourm/uploads/previews
```

Run the database migration before enabling the renderer.  A map or blueprint
is queued only after moderator approval.  Parse failures, unavailable workers,
and files larger than 20 MiB leave the original approved download available;
they never manufacture metadata or a preview.

## Persisted metadata allowlist

`ResourcePreviewService.safeMetadata` is the only path from renderer output
into `resources.renderer_metadata_json`. It keeps an explicit key allowlist, so
a field the renderer starts emitting is invisible until it is added there —
the detail page then reports the analysis as unavailable even though the
renderer produced it. Adding a projection to the renderer means adding it to
the allowlist in the same change.

Currently allowlisted analysis projections: `estimated_build_time_seconds`,
`estimated_build_time_method`, `compatibility`, `unknown_content`,
`structure_hash`, `normalized_structure_hash`, `schematic_format_version`,
`save_format_version`, `map_build_metadata`, `parser_runtime`, `production`,
`tile_layers`, `wave_groups`, `requirements`, `block_types`.

`structure_hash` is not only a display field: duplicate detection matches on it,
so dropping it silently disables structure-duplicate detection.

Large maps lose deposit tiles when a `tile_layers` array exceeds the 10 000
entry cap. The service now flags that as `tile_layers_truncated` for the
deposit layers too, not just `terrain`.

## Legacy metadata healing

Maps and blueprints published before a renderer projection existed keep their
old metadata forever unless something re-parses them. `ensureAnalysisMetadata`
closes that gap: on a public read it checks whether the persisted metadata
carries the projections the reader needs (`production` and
`estimated_build_time_seconds` for schematics; `tile_layers` and `wave_groups`
for maps), and if not, re-renders once in the background. An absent key — not a
null value — is the signal, because the renderer always emits the key for its
kind.

The background pass is guarded: at most one attempt per resource per hour per
process, at most 24 concurrent, and it never blocks the request that triggered
it. A healed resource no longer matches the predicate, so the check converges
to a no-op. Re-run it for a whole install by re-publishing a version, or run
the resource V2 backfill after deploying, which folds legacy tile layers into
`map_resource_entries`.

## Acceptance check

1. Upload an `.msav` or `.msch` as a resource with the matching resource kind.
2. Approve it in the moderation queue.
3. Confirm `GET /api/resources/{id}/render-status` becomes `ready`.
4. Confirm `GET /api/resources/{id}/preview` returns `image/png` and the
   resource detail page displays it.
5. Confirm the worker port is unreachable except from loopback.
6. Confirm `GET /api/resources/{id}` returns `estimated_build_time_seconds` for a
   schematic and `tile_layers`/`wave_groups` for a map, and that the detail page
   shows the build time, resource deposits and wave ranges instead of the
   unavailable placeholder.
