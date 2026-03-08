#!/bin/bash
# Wrapper to run btcr2 scripts with correct node_modules path
# Usage: bash run.sh <script.mjs> [args...]
set -e
BTCR2_DIR="${OPENCLAW_WORKSPACE:-/home/node/.openclaw/workspace}/tools/btcr2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$1"; shift

if [ ! -d "$BTCR2_DIR/node_modules/@did-btcr2" ]; then
  echo "btcr2 not installed. Running setup..." >&2
  bash "$SCRIPT_DIR/setup.sh"
fi

# Symlink node_modules so ESM resolution works from script dir
if [ ! -e "$SCRIPT_DIR/node_modules" ]; then
  ln -s "$BTCR2_DIR/node_modules" "$SCRIPT_DIR/node_modules"
fi
# Also need a package.json with type:module for .mjs
if [ ! -e "$SCRIPT_DIR/package.json" ]; then
  echo '{"type":"module"}' > "$SCRIPT_DIR/package.json"
fi
exec node "$SCRIPT_DIR/$SCRIPT" "$@"
