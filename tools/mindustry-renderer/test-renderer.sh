#!/usr/bin/env bash
set -euo pipefail

renderer_dir="$(cd "$(dirname "$0")" && pwd)"
server_jar="$(printenv MINDUSTRY_SERVER_JAR || true)"
desktop_jar="$(printenv MINDUSTRY_DESKTOP_JAR || true)"
if [[ -z "$server_jar" ]]; then server_jar="$renderer_dir/build/deps/server-release-v160.5.jar"; fi
if [[ -z "$desktop_jar" ]]; then desktop_jar="$renderer_dir/build/deps/Mindustry-v160.5.jar"; fi
server_sha256='0bd327c6c3d551e7e8fdab7b695517f809baacca3b1f5cb1c1a8dd74836620e0'
desktop_sha256='c2fd5a5dcb8d306525bb47ff28121237d4d25f53868562946491f2ef261dc272'
build_dir="$renderer_dir/build/pr-verification"
main_classes="$build_dir/classes/main"
test_classes="$build_dir/classes/test"
assets_dir="$build_dir/assets"

for artifact in "$server_jar" "$desktop_jar"; do
  if [[ ! -r "$artifact" ]]; then
    printf 'Pinned Mindustry artifact not found: %s\n' "$artifact" >&2
    exit 1
  fi
done
printf '%s  %s\n' "$server_sha256" "$server_jar" | sha256sum --check --status || {
  printf 'Pinned Mindustry server JAR checksum mismatch: %s\n' "$server_jar" >&2
  exit 1
}
printf '%s  %s\n' "$desktop_sha256" "$desktop_jar" | sha256sum --check --status || {
  printf 'Pinned Mindustry desktop JAR checksum mismatch: %s\n' "$desktop_jar" >&2
  exit 1
}

rm -rf "$build_dir"
mkdir -p "$main_classes" "$test_classes" "$assets_dir"
mapfile -d '' -t main_sources < <(find "$renderer_dir/src/main/java" -type f -name '*.java' -print0 | sort -z)
mapfile -d '' -t test_sources < <(find "$renderer_dir/src/test/java" -type f -name '*.java' -print0 | sort -z)
if (( ${#main_sources[@]} == 0 || ${#test_sources[@]} == 0 )); then
  printf 'Renderer main or test Java sources are missing.\n' >&2
  exit 1
fi

classpath="$server_jar:$desktop_jar"
javac --release 17 -cp "$classpath" -d "$main_classes" "${main_sources[@]}"
if [[ -d "$renderer_dir/src/main/resources" ]]; then
  cp -R "$renderer_dir/src/main/resources/." "$main_classes/"
fi
javac --release 17 -cp "$classpath:$main_classes" -d "$test_classes" "${test_sources[@]}"
if [[ -d "$renderer_dir/src/test/resources" ]]; then
  cp -R "$renderer_dir/src/test/resources/." "$test_classes/"
fi
unzip -q "$desktop_jar" 'sprites/*' -d "$assets_dir"

for fixture in \
  cn.mdtbbs.renderer.RendererVisualRegression \
  cn.mdtbbs.renderer.EditorSafetyRegression; do
  ASSETS_ROOT="$assets_dir" java -Djava.awt.headless=true \
    -cp "$classpath:$main_classes:$test_classes" \
    "$fixture"
done

printf 'Mindustry renderer compile and fixture verification passed.\n'
