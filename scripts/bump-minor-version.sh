#!/bin/sh
# Compatibility wrapper for older local workflows. New code should use npm run version:minor.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$SCRIPT_DIR/bump-version.cjs" minor
