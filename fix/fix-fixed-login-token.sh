#!/usr/bin/env sh
# Pin the browser login token to a fixed value instead of the random
# per-launch token dsh generates by default.
#
# Root cause: dsh-client-connection's BrowserAuth mints a fresh 32-byte random
# launch token for every process start (processLaunchToken, lib/index.js) and
# prints it to the server log as the `?token=` on the web URL. To log in you
# must copy that token out of Render's log every single time the service
# redeploys or reboots. That is a chore, and the token shows up in logs the
# user does not want to dig through.
#
# Fix: when DSH_WEB_TOKEN is set in the environment, use it verbatim as the
# launch token, so the login code becomes a stable password. The env var is
# never part of the image or the repo — Render injects it as a secret at
# runtime, so the repo stays free of credentials. When unset, behavior is
# unchanged (random per-launch token), so local `dsh web` keeps working.
#
# Runs at image build time (Dockerfile) and is idempotent — a repeat
# invocation after a dependency reinstall is safe. python3 is already in the
# image (needed to build koffi's native module), so use it for the literal
# edit.

set -eu

ROOT="${1:-/usr/local/lib/node_modules/@deepseek-ai/dsh}"

if [ ! -d "$ROOT" ]; then
	echo "[token-fix] no dsh install at $ROOT; nothing to do"
	exit 0
fi

echo "[token-fix] scanning $ROOT"

# npm's hoisting is unreliable with the prerelease ranges in this tree, so
# dsh-client-connection can land several levels deep rather than directly
# under $ROOT/node_modules. Scan for every physical copy and patch each one,
# exactly like the win32 and settings fixes do.
count=0
patched=0
for pkg in $(find "$ROOT" -type d -name 'dsh-client-connection'); do
	count=$((count + 1))
	FILE="$pkg/lib/index.js"
	if [ ! -f "$FILE" ]; then
		echo "[token-fix]   skip (no lib/index.js): ${pkg#$ROOT/}"
		continue
	fi

	# Already patched? (marker comment is left in place by the edit below)
	if grep -q 'dsh-render fixed-token patch' "$FILE"; then
		echo "[token-fix]   already patched: ${pkg#$ROOT/}"
		continue
	fi

	python3 - "$FILE" <<'PY_INS' || exit 1
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()

old = (
	"function processLaunchToken(owner) {\n"
	"\tconst existing = PROCESS_LAUNCH_TOKENS.get(owner);\n"
	"\tif (existing !== void 0) return existing;\n"
	"\tconst created = encodeBase64Url(randomBytes(SECRET_BYTES));\n"
	"\tPROCESS_LAUNCH_TOKENS.set(owner, created);\n"
	"\treturn created;\n"
	"}"
)

new = (
	"/* dsh-render fixed-token patch: dsh mints a fresh random launch token\n"
	"\t * * on every process start and prints it to the server log, so logging\n"
	"\t * * in after every deploy/reboot means copying it out of the logs. When\n"
	"\t * * DSH_WEB_TOKEN is set in the environment, use it verbatim as the\n"
	"\t * launch token and the login code becomes a stable password. The env\n"
	"\t * * var is injected by Render at runtime and never lives in the image\n"
	"\t * or the repo. Unset => unchanged random-per-launch behavior. */\n"
	"function processLaunchToken(owner) {\n"
	"\tconst existing = PROCESS_LAUNCH_TOKENS.get(owner);\n"
	"\tif (existing !== void 0) return existing;\n"
	"\tconst fixed = process.env.DSH_WEB_TOKEN;\n"
	"\tif (typeof fixed === \"string\" && fixed !== \"\") {\n"
	"\t\tPROCESS_LAUNCH_TOKENS.set(owner, fixed);\n"
	"\t\treturn fixed;\n"
	"\t}\n"
	"\tconst created = encodeBase64Url(randomBytes(SECRET_BYTES));\n"
	"\tPROCESS_LAUNCH_TOKENS.set(owner, created);\n"
	"\treturn created;\n"
	"}"
)

assert src.count(old) == 1, "expected exactly one processLaunchToken body in " + p
open(p, "w", encoding="utf-8").write(src.replace(old, new))
PY_INS

	patched=$((patched + 1))
	echo "[token-fix]   PATCHED: ${pkg#$ROOT/} (DSH_WEB_TOKEN override)"
done

if [ "$count" -eq 0 ]; then
	echo "[token-fix] no dsh-client-connection under $ROOT; nothing to do"
	exit 0
fi
echo "[token-fix] copies=$count patched=$patched"
