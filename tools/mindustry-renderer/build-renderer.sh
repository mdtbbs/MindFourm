#!/usr/bin/env bash
set -euo pipefail

renderer_dir="$(cd "$(dirname "$0")" && pwd)"
repo_dir="$(cd "$renderer_dir/../.." && pwd)"
server_jar="${MINDUSTRY_SERVER_JAR:-/opt/mindfourm-renderer/mindustry-server-v160.2.jar}"
expected_server_sha256="fc686a6198419a91cbc1649f93f10cc54f8e1e65160313840c9aab7c2c78fe57"
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

actual_server_sha256="$(sha256sum "$server_jar" | awk '{print tolower($1)}')"
if [[ "$actual_server_sha256" != "$expected_server_sha256" ]]; then
  printf 'Mindustry server runtime digest mismatch: expected %s, got %s (%s)\n' \
    "$expected_server_sha256" "$actual_server_sha256" "$server_jar" >&2
  exit 1
fi

rm -rf "$classes_dir"
mkdir -p "$classes_dir" "$releases_dir"
chmod 755 "$runtime_dir" "$releases_dir"
mapfile -d '' -t java_sources < <(find "$renderer_dir/src/main/java" -name '*.java' -type f -print0 | sort -z)
if [[ "${#java_sources[@]}" -eq 0 ]]; then
  printf 'No renderer Java sources found under %s\n' "$renderer_dir/src/main/java" >&2
  exit 1
fi
javac --release 17 -cp "$server_jar" -d "$classes_dir" "${java_sources[@]}"
if [[ -d "$renderer_dir/src/main/resources" ]]; then
  cp -R "$renderer_dir/src/main/resources/." "$classes_dir/"
fi

stage_dir="$(mktemp -d "$releases_dir/.${revision}.XXXXXX")"
trap 'rm -rf "$stage_dir"' EXIT
jar --create --file "$stage_dir/mindfourm-mindustry-renderer.jar" \
  --main-class cn.mdtbbs.renderer.MapRenderer \
  -C "$classes_dir" .
chmod 644 "$stage_dir/mindfourm-mindustry-renderer.jar"
chmod 755 "$stage_dir"
# Copy the verified runtime into the immutable release instead of linking an
# external path that could change after the health metadata was established.
cp "$server_jar" "$stage_dir/mindustry-server.jar"
chmod 644 "$stage_dir/mindustry-server.jar"

release_dir="$releases_dir/$revision"
if [[ ! -e "$release_dir" ]]; then
  mv "$stage_dir" "$release_dir"
fi
link_tmp="$runtime_dir/.current-$revision"
rm -f "$link_tmp"
ln -s "releases/$revision" "$link_tmp"
mv -Tf "$link_tmp" "$runtime_dir/current"
printf 'Built renderer release %s: %s\n' "$revision" "$release_dir/mindfourm-mindustry-renderer.jar"
