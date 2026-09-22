#!/usr/bin/env bash
set -euo pipefail

renderer_dir="$(cd "$(dirname "$0")" && pwd)"
server_jar="${MINDUSTRY_SERVER_JAR:-/opt/mindfourm-renderer/mindustry-server-v160.2.jar}"
classes_dir="$renderer_dir/build/classes/java/main"
libs_dir="$renderer_dir/build/libs"
output_jar="$libs_dir/mindfourm-mindustry-renderer.jar"

if [[ ! -r "$server_jar" ]]; then
  printf 'Mindustry server runtime not found: %s\n' "$server_jar" >&2
  exit 1
fi

rm -rf "$classes_dir"
mkdir -p "$classes_dir" "$libs_dir"
javac --release 17 -cp "$server_jar" -d "$classes_dir" \
  "$renderer_dir/src/main/java/cn/mdtbbs/renderer/MapRenderer.java"
if [[ -d "$renderer_dir/src/main/resources" ]]; then
  cp -R "$renderer_dir/src/main/resources/." "$classes_dir/"
fi
jar --create --file "$output_jar" \
  --main-class cn.mdtbbs.renderer.MapRenderer \
  -C "$classes_dir" .
printf 'Built renderer: %s\n' "$output_jar"
