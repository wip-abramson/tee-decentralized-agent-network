#!/bin/bash
# Wrapper to run btcr2 wallet scripts with correct node_modules
set -e
BTCR2_DIR="${OPENCLAW_WORKSPACE:-/home/node/.openclaw/workspace}/tools/btcr2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$1"; shift

if [ ! -d "$BTCR2_DIR/node_modules/@did-btcr2" ]; then
  echo "Installing btcr2 packages..." >&2
  mkdir -p "$BTCR2_DIR"
  cd "$BTCR2_DIR"
  npm init -y --silent 2>/dev/null
  npm install @did-btcr2/method @did-btcr2/keypair @did-btcr2/cryptosuite 2>&1 >&2
fi

# Symlink node_modules for ESM resolution
[ ! -e "$SCRIPT_DIR/node_modules" ] && ln -s "$BTCR2_DIR/node_modules" "$SCRIPT_DIR/node_modules"
[ ! -e "$SCRIPT_DIR/package.json" ] && echo '{"type":"module"}' > "$SCRIPT_DIR/package.json"

exec node "$SCRIPT_DIR/$SCRIPT" "$@"
