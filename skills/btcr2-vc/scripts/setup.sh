#!/bin/bash
# Setup btcr2 dependencies in workspace
set -e
BTCR2_DIR="${OPENCLAW_WORKSPACE:-/home/node/.openclaw/workspace}/tools/btcr2"
if [ -d "$BTCR2_DIR/node_modules/@did-btcr2" ]; then
  echo "btcr2 packages already installed at $BTCR2_DIR"
  exit 0
fi
mkdir -p "$BTCR2_DIR"
cd "$BTCR2_DIR"
npm init -y --silent 2>/dev/null
npm install @did-btcr2/method @did-btcr2/keypair @did-btcr2/cryptosuite 2>&1
echo "btcr2 packages installed at $BTCR2_DIR"
