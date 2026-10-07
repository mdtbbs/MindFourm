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

## Acceptance check

1. Upload an `.msav` or `.msch` as a resource with the matching resource kind.
2. Approve it in the moderation queue.
3. Confirm `GET /api/resources/{id}/render-status` becomes `ready`.
4. Confirm `GET /api/resources/{id}/preview` returns `image/png` and the
   resource detail page displays it.
5. Confirm the worker port is unreachable except from loopback.
