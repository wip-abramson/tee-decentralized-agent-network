#!/bin/bash
# Wrapper to run btcr2 wallet scripts with correct node_modules
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BTCR2_DIR="${BTCR2_DIR:-$SCRIPT_DIR/btcr2_deps}"
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

# Default wallet path is relative to the skill directory (one level up from scripts/)
export WALLET_PATH="${WALLET_PATH:-$(dirname "$SCRIPT_DIR")/wallet}"

exec node "$SCRIPT_DIR/$SCRIPT" "$@"
