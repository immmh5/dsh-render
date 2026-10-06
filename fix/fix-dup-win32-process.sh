#!/usr/bin/env sh
# Fix the `dsh web` boot crash on Render:
#
#   Error: Duplicate type name 'DSH_STARTUPINFOW'
#     at .../dsh-win32-process/lib/index.js  (koffi.struct)
#
# Root cause: @deepseek-ai/dsh@0.1.5-rc.2 loads dsh-subprocess-local and
# dsh-sandbox-windows-acl at 0.1.5-rc.3, which declare
# "@deepseek-ai/dsh-win32-process": "^0.1.5-rc.3". npm's prerelease
# comparator does NOT satisfy that range with the installed 0.1.5-rc.2, so
# those deps are never hoisted and four physical copies of
# dsh-win32-process end up in the tree. koffi registers struct layout names
# in a process-global registry, so the second copy to load throws at import
# time and `dsh web` dies before it binds a port. dsh cannot be bumped to a
# newer release here (dsh-telegram-duty's peers only target ^0.1.5-rc.2), so
# the version mix is not fixable by upgrading.
#
# Fix: swap the koffi import for an inert stub on non-Windows hosts. The
# Win32 FFI paths only ever run inside the Windows subprocess runner, so this
# is a runtime no-op on Linux and makes the module import cleanly no matter
# how many physical copies npm leaves behind. Runs at build time (Dockerfile)
# and is idempotent, so a repeat invocation after a dependency reinstall is
# safe.
#
# Verified by reproducing the exact failure on 4 fresh copies of
# @deepseek-ai/dsh-win32-process@0.1.5-rc.2 pulled from npm: before this
# patch, importing copy 2 throws "Duplicate type name 'DSH_STARTUPINFOW'";
# after it, all four load cleanly.

set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${1:-/usr/local/lib/node_modules/@deepseek-ai/dsh}"

if [ ! -d "$ROOT" ]; then
	echo "[win32-fix] no dsh install at $ROOT; nothing to do"
	exit 0
fi
if [ ! -f "$HERE/win32-stub.js" ]; then
	echo "[win32-fix] missing $HERE/win32-stub.js" >&2
	exit 1
fi

echo "[win32-fix] scanning $ROOT"

count=0
patched=0
for pkg in $(find "$ROOT" -type d -name 'dsh-win32-process'); do
	count=$((count + 1))
	index="$pkg/lib/index.js"
	[ -f "$index" ] || { echo "[win32-fix]   skip (no lib/index.js): ${pkg#$ROOT/}"; continue; }
	if grep -q 'win32-stub.js' "$index"; then
		echo "[win32-fix]   already patched: ${pkg#$ROOT/}"
		continue
	fi

	# 1) Replace the eager koffi import with a lazy one that falls back to the
	#    stub off Windows. python3 is already in this image (needed to build
	#    koffi's native module), so use it for the literal edit.
	python3 - "$index" <<'PY'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
old = 'import koffi from "koffi";\n'
new = (
	'import { createKoffiStub } from "./win32-stub.js";\n'
	'/* Non-Windows hosts never execute the Win32 FFI paths, but koffi\n'
	' * registers struct types in a process-global registry. Loading more than\n'
	' * one physical copy of this module (npm cannot always dedupe prerelease\n'
	' * ranges) therefore throws "Duplicate type name" at import time. Swap in\n'
	' * an inert stub so the module imports cleanly on every platform. */\n'
	'const koffi = process.platform === "win32" ? (await import("koffi")).default : createKoffiStub();\n'
)
assert src.startswith(old), "unexpected header in " + p
open(p, "w", encoding="utf-8").write(new + src[len(old):])
PY

	# 2) Drop the stub module next to index.js.
	cp "$HERE/win32-stub.js" "$pkg/lib/win32-stub.js"

	patched=$((patched + 1))
	echo "[win32-fix]   PATCHED: ${pkg#$ROOT/}"
done

echo "[win32-fix] copies=$count patched=$patched"
