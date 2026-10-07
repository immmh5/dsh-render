#!/usr/bin/env bash
# dsh-rtl — one command: build, patch, register, restart.
# Safe to re-run any time (after a rebuild, or after a Harness update).
#   NO_RESTART=1 install.sh     build + patch + register, no restart
#   python3 patch_harness.py --revert    undo the on-disk direction fixes
set -uo pipefail

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR" || exit 1

fail=0
step() { printf '\n[dsh-rtl] %s\n' "$1"; }

# --- 1. regenerate lib/client.js (locales + mirrored RTL CSS) -----------------
step "1/4 build"
if ! python3 "$DIR/build.py"; then
	echo "[dsh-rtl] build FAILED" >&2
	fail=1
fi

# --- 2. register the plugin with the web profile ------------------------------
step "2/4 register plugin"
dsh_bin=$(command -v dsh 2>/dev/null || true)
if [ -z "$dsh_bin" ] && [ -x "$HOME/.npm-global/bin/dsh" ]; then
	dsh_bin="$HOME/.npm-global/bin/dsh"
fi
if [ -z "$dsh_bin" ]; then
	echo "[dsh-rtl] dsh CLI not found on PATH" >&2
	fail=1
elif ! "$dsh_bin" plugin --profile web add "file:$DIR"; then
	echo "[dsh-rtl] plugin registration FAILED" >&2
	fail=1
fi

# --- 3. apply the idempotent on-disk direction fixes ---------------------------
step "3/4 patch Harness"
if ! python3 "$DIR/patch_harness.py"; then
	echo "[dsh-rtl] harness patch FAILED (revert with: python3 patch_harness.py --revert)" >&2
	fail=1
fi

# --- 4. restart the web GUI ----------------------------------------------------
if [ "${NO_RESTART:-0}" = "1" ]; then
	step "4/4 restart skipped (NO_RESTART=1)"
else
	step "4/4 restart"
	log=/tmp/dsh-web-rtl.log
	if command -v dsh-web >/dev/null 2>&1; then
		nohup dsh-web >"$log" 2>&1 &
	elif [ -x "$HOME/.npm-global/bin/dsh-web" ]; then
		nohup "$HOME/.npm-global/bin/dsh-web" >"$log" 2>&1 &
	elif [ -n "$dsh_bin" ]; then
		nohup "$dsh_bin" web >"$log" 2>&1 &
	else
		echo "[dsh-rtl] no launcher found; start dsh-web yourself" >&2
		fail=1
	fi
	[ -f "$log" ] && echo "[dsh-rtl] restart log: $log"
fi

printf '\n[dsh-rtl] done%s\n' "$([ "$fail" -eq 0 ] && echo '' || echo ' (with errors)')"
exit "$fail"
