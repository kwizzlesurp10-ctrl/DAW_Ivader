#!/usr/bin/env bash
VITE_CMD="${1:-build}"
unset npm_config_prefix
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "nvm not found. Install from https://github.com/nvm-sh/nvm or run: unset npm_config_prefix && nvm use 20 && npm run build"
  exit 1
fi
source "$NVM_DIR/nvm.sh"
NODE_BIN=$(nvm which 20 2>/dev/null || nvm which 18 2>/dev/null)
if [[ -z "$NODE_BIN" ]]; then
  echo "Node 18+ not found. Run: nvm install 20"
  exit 1
fi
exec "$NODE_BIN" node_modules/vite/bin/vite.js "$VITE_CMD"
