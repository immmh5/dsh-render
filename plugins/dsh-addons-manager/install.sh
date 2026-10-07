#!/usr/bin/env bash
# dsh-addons-manager — verify the plugin, then install it into the web profile.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_BIN="${DSH_BIN:-dsh}"
PROFILE="${DSH_PROFILE:-web}"

say() { printf '%s\n' "$*"; }

if command -v node >/dev/null 2>&1; then
  say "· syntax"
  node --check "$SRC/lib/host.js"
  node --check "$SRC/lib/client.js"
  node --check "$SRC/lib/yamlkit.mjs"
  node --check "$SRC/lib/patchops.mjs"
  say "· tests"
  node "$SRC/test/yamlkit.test.mjs"
  node "$SRC/test/patchops.test.mjs"
  node "$SRC/test/client.test.mjs"
else
  say "! node not on PATH — skipping syntax checks and tests"
fi

if ! command -v "$DSH_BIN" >/dev/null 2>&1; then
  say "! '$DSH_BIN' not on PATH — set DSH_BIN or add dsh to PATH, then run:"
  say "  $DSH_BIN plugin --profile $PROFILE add file:$SRC"
  exit 1
fi

say "· installing into profile $PROFILE"
if ! "$DSH_BIN" plugin --profile "$PROFILE" add "file:$SRC"; then
  say "! install reported a problem; if the package is already registered,"
  say "  re-run it, or refresh the profile with: pnpm install --dir \"\$HOME/.dsh/profiles/$PROFILE\""
  exit 1
fi

say "· done. Restart the web GUI (dsh-web) to load the new section."
say "  Settings → الإضافات بالجملة (order 94, right above إدارة الإضافات)."
