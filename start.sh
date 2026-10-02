#!/bin/sh
set -e

# Render sets PORT; bind to all interfaces so the Render proxy can reach us,
# and never try to open a browser inside a container.
PORT="${PORT:-3080}"
HOST="${HOST:-0.0.0.0}"

# The web profile auto-initializes on first boot (dsh ships a template). Its
# plugins install on that first boot too, which takes a few minutes; later
# boots reuse the profile already in $DSH_HOME on the persistent disk.
echo "[dsh] booting web profile on ${HOST}:${PORT}"
exec dsh web --host "$HOST" --port "$PORT" --no-open
