#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  source "$NVM_DIR/nvm.sh"
  nvm use 2>/dev/null || nvm use 20 2>/dev/null || true
  NODE_BIN=$(nvm which 20 2>/dev/null || nvm which 18 2>/dev/null)
  if [[ -n "$NODE_BIN" ]]; then
    export PATH="$(dirname "$NODE_BIN"):$PATH"
  fi
fi
exec npx vercel --prod "$@"
