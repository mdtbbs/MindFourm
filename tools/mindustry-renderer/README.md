# MindFourm Mindustry renderer

This is a forum-owned, loopback-only Java worker.  It parses user-provided
`.msav` maps and `.msch` schematics using the official Mindustry runtime, then
writes PNG previews under `RESOURCE_PREVIEW_ROOT`.  It must run under a
dedicated unprivileged OS account with no network egress, one CPU, and a 512 MB
memory limit.  The forum never exposes the worker port.

Build the worker and runtime with Java 17 and Gradle:

```bash
cd tools/mindustry-renderer
gradle clean build copyMindustryRuntime copyMindustryAssets
```

Start it with the same preview root as the forum:

```bash
STORAGE_ROOT=/data/mindfourm/uploads/previews \
ASSETS_ROOT=/opt/mindfourm-renderer/assets \
WORKER_TOKEN=replace-me \
java -Xmx512m -cp build/libs/mindfourm-mindustry-renderer-0.1.0.jar:build/libs/mindustry-server-v160.2.jar cn.mdtbbs.renderer.MapRenderer
```

Set the forum's `RESOURCE_RENDERER_URL=http://127.0.0.1:6100`, matching
`RESOURCE_RENDERER_TOKEN`, and `RESOURCE_PREVIEW_ROOT` to the same directory.
The worker accepts only `POST /v1/analyze`; its input is capped at 20 MiB and
all generated paths are content-hash derived.

`copyMindustryAssets` extracts only the official desktop `sprites/` directory.
Deploy that directory to `ASSETS_ROOT`; it is read-only at runtime and is kept
outside the worker JAR so normal schematic previews render recognisable
Mindustry block icons without requiring an OpenGL context.

The production release also runs `npm run build:renderer`, which compiles the
worker against `MINDUSTRY_SERVER_JAR` (defaulting to the v160.2 runtime already
installed on the production host) and packages the resources directory into a
revisioned `renderer-runtime/releases/` directory. It switches the
`renderer-runtime/current` symlink only after a complete build, so the active
worker remains startable if compilation fails. The generated `build/` and
`renderer-runtime/` directories are ignored by Git.

The worker also exposes authenticated `GET /v1/content-metadata?items=...&blocks=...`
for batched schematic labels and icons. It uses the bundled Mindustry v160.2
Simplified Chinese localization file and the same official sprite atlas used by
the preview renderer. Unknown IDs keep their internal name and return a null icon.
