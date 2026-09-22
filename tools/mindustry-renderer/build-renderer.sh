#!/usr/bin/env bash
set -euo pipefail

renderer_dir="$(cd "$(dirname "$0")" && pwd)"
repo_dir="$(cd "$renderer_dir/../.." && pwd)"
server_jar="${MINDUSTRY_SERVER_JAR:-/opt/mindfourm-renderer/mindustry-server-v160.2.jar}"
classes_dir="$renderer_dir/build/classes/java/main"
runtime_dir="$repo_dir/renderer-runtime"
releases_dir="$runtime_dir/releases"

if ! revision="$(git -C "$repo_dir" rev-parse --verify HEAD 2>/dev/null)"; then
  revision="local-$(date -u +%Y%m%d%H%M%S)"
fi

if [[ ! -r "$server_jar" ]]; then
  printf 'Mindustry server runtime not found: %s\n' "$server_jar" >&2
  exit 1
fi

rm -rf "$classes_dir"
mkdir -p "$classes_dir" "$releases_dir"
javac --release 17 -cp "$server_jar" -d "$classes_dir" \
  "$renderer_dir/src/main/java/cn/mdtbbs/renderer/MapRenderer.java"
if [[ -d "$renderer_dir/src/main/resources" ]]; then
  cp -R "$renderer_dir/src/main/resources/." "$classes_dir/"
fi

stage_dir="$(mktemp -d "$releases_dir/.${revision}.XXXXXX")"
trap 'rm -rf "$stage_dir"' EXIT
jar --create --file "$stage_dir/mindfourm-mindustry-renderer.jar" \
  --main-class cn.mdtbbs.renderer.MapRenderer \
  -C "$classes_dir" .
ln -s "$server_jar" "$stage_dir/mindustry-server.jar"

release_dir="$releases_dir/$revision"
if [[ ! -e "$release_dir" ]]; then
  mv "$stage_dir" "$release_dir"
fi
link_tmp="$runtime_dir/.current-$revision"
rm -f "$link_tmp"
ln -s "releases/$revision" "$link_tmp"
mv -Tf "$link_tmp" "$runtime_dir/current"
printf 'Built renderer release %s: %s\n' "$revision" "$release_dir/mindfourm-mindustry-renderer.jar"
