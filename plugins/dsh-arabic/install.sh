#!/bin/sh
# Install / refresh dsh-arabic as a web-profile plugin.
# Safe to re-run any time (after a rebuild, or after a Harness update).
set -e
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

echo "[dsh-arabic] validating + building lib/client.js"
python3 "$DIR/build.py"

echo "[dsh-arabic] Arabicizing add-on sources that ship their own i18n tables"
python3 "$DIR/patch_addons.py"

echo "[dsh-arabic] Arabicizing the Telegram-facing add-ons"
python3 "$DIR/patch_telegram.py"

echo "[dsh-arabic] refreshing the Telegram bot command menu (needs network)"
python3 "$DIR/push_tg_menu.py" || echo "[dsh-arabic] menu push skipped (offline / no token)"

echo "[dsh-arabic] installing into the web profile"
exec dsh plugin --profile web add "file:$DIR"
