#!/usr/bin/env sh
# Fix "settings are unavailable in this browser" when `dsh web` is served
# through a reverse proxy (nginx on Render) instead of being opened on
# 127.0.0.1 directly.
#
# Root cause: dsh-client-connection derives
#
#   isLoopback = transport?.ownsHost || pageLocation===undefined || isLoopbackHostname(hostname)
#
# Three terms, all false in this deployment:
#   * transport is undefined — `globalThis.__DSH_TRANSPORT__` is a dev-only
#     handoff injected by dsh's own dev tooling, never present in the built
#     production bundle.
#   * pageLocation is defined — the browser loads the app from
#     https://dsh-iedu.onrender.com.
#   * isLoopbackHostname() is false — the public hostname is not loopback.
#
# So isLoopback === false, and two client plugins read that flag to decide
# whether the UI may touch the host settings store:
#   * dsh-client-ui-settings/lib/client.js:1345
#       persistence = isLoopback ? "host" : "memory"
#     "memory" short-circuits every read/write to a no-op Promise.resolve()
#     (lines 1075/1237/1253), so the describe mirror never loads and the
#     settings panel renders nothing but "unavailable in this browser".
#   * dsh-client-ui-settings-general/lib/client.js:540
#       documentController = isLoopback ? new SettingsDocumentStore(...) : undefined
#     which additionally keeps the General section from ever mounting its form.
#
# The RPC path itself is fine — dsh-client-connection's createWebConnectionRpc
# sends unary calls like settings/describe as plain HTTP POST against
# location.origin (line 6206), and nginx proxies those straight through; only
# this one boolean is gating the UI.
#
# Fix: force the single source of truth to true. Patching the derivation in
# dsh-client-connection fixes both consumers at once, and isLoopback has no
# other reader in the tree (dsh-api-gateway merely re-publishes it). This is
# safe here because the deployment already gates remote access behind dsh's
# own authorizeIndex session cookie plus the trusted-host fence, so the
# settings UI reaching the host store is exactly the intended UX.
#
# Runs at image build time (Dockerfile), before the settings RPC is ever
# exercised, and is idempotent — a repeat invocation after a dependency
# reinstall is safe. python3 is already in the image (needed to build koffi's
# native module), so use it for the literal edit.

set -eu

ROOT="${1:-/usr/local/lib/node_modules/@deepseek-ai/dsh}"

if [ ! -d "$ROOT" ]; then
	echo "[settings-fix] no dsh install at $ROOT; nothing to do"
	exit 0
fi

FILE="$ROOT/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js"
[ -f "$FILE" ] || {
	echo "[settings-fix] not found: ${FILE#$ROOT/}" >&2
	exit 1
}

# Already patched? (marker comment is left in place by the edit below)
if grep -q 'dsh-render settings-loopback patch' "$FILE"; then
	echo "[settings-fix] already patched: ${FILE#$ROOT/}"
	exit 0
fi

python3 - "$FILE" <<'PY'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
old = (
	"isLoopback: transport?.ownsHost === true || pageLocation === void 0 "
	"|| isLoopbackHostname(pageLocation.hostname),"
)
new = (
	"/* dsh-render settings-loopback patch: dsh web is reached through a\n"
	" * * reverse proxy on a public hostname, so every term of the built-in\n"
	" * * loopback test (dev-only transport, page hostname) is false here and\n"
	" * * the settings UI decides it may not touch the host store at all.\n"
	" * * This deployment already authenticates remote access (session cookie\n"
	" * * + trusted-host fence), so report loopback unconditionally and let the\n"
	" * * settings panels read and write the host store as intended. */\n"
	"isLoopback: true,"
)
assert src.count(old) == 1, "expected exactly one isLoopback derivation in " + p
open(p, "w", encoding="utf-8").write(src.replace(old, new))
PY

echo "[settings-fix] PATCHED: ${FILE#$ROOT/} (isLoopback => true)"
