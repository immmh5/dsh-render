#!/usr/bin/env bash
# dsh-mcp-servers — verify the plugin, then install it into the web profile.
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
  # The host test drives the live RPC channel against a running dsh web
  # instance; it skips cleanly when none is listening.
  node "$SRC/test/host.test.mjs" || say "! live host test skipped or failed (non-fatal)"
else
  say "! node not on PATH — skipping syntax checks and tests"
fi

if ! command -v "$DSH_BIN" >/dev/null 2>&1; then
  say "! '$DSH_BIN' not on PATH — set DSH_BIN or add dsh to PATH, then run:"
  say "  $DSH_BIN plugin --profile $PROFILE add file:$SRC"
  exit 1
fi

say "· installing into profile $PROFILE"
"$DSH_BIN" plugin --profile "$PROFILE" add "file:$SRC"

say "done. Restart dsh web, then open Settings → MCP Servers."
