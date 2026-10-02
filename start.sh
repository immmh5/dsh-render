#!/bin/sh
set -e

# Render assigns PORT and proxies HTTPS to it. nginx listens on that port on
# all interfaces; dsh's web UI stays on loopback (it refuses 0.0.0.0 by design
# to avoid exposing remote code execution to the network).
: "${PORT:=3080}"
DSH_PORT="${DSH_PORT:-13080}"
export NGINX_PORT="$PORT"

# Where dsh keeps settings, sessions, and skills. Render mounts a disk here so
# they survive redeploys.
: "${DSH_HOME:=/data}"
export DSH_HOME

# Render's public hostname (e.g. dsh-xxxx.onrender.com) for dsh's /api
# browser-trust fence; blank until you set TRUSTED_HOST in the dashboard.
TRUSTED="${TRUSTED_HOST:-}"

# nginx.conf has placeholders (nginx cannot expand env vars in listen/
# proxy_pass), so render the real config here and hand nginx the result.
sed -e "s/__NGINX_PORT__/${PORT}/g" -e "s/__DSH_PORT__/${DSH_PORT}/g" \
  /app/nginx.conf > /tmp/nginx.runtime.conf

echo "[dsh] starting: nginx 0.0.0.0:${PORT} -> dsh 127.0.0.1:${DSH_PORT} (trusted: ${TRUSTED:-none})"

# Launch dsh on loopback. The web profile auto-initializes on first boot
# (plugins install then; later boots reuse what the disk already holds).
(
  if [ -n "$TRUSTED" ]; then
    exec dsh web --host 127.0.0.1 --port "$DSH_PORT" --no-open --trusted-host "$TRUSTED"
  else
    exec dsh web --host 127.0.0.1 --port "$DSH_PORT" --no-open
  fi
) &
DSH_PID=$!

# Give dsh a moment, then start nginx in the foreground as PID 1's process.
# If dsh dies, nginx still serves (healthcheck stays green, you can read logs);
# the supervisor below restarts dsh if it exits.
(
  while true; do
    if ! kill -0 "$DSH_PID" 2>/dev/null; then
      echo "[dsh] process exited; restarting in 5s"
      sleep 5
      (
        if [ -n "$TRUSTED" ]; then
          exec dsh web --host 127.0.0.1 --port "$DSH_PORT" --no-open --trusted-host "$TRUSTED"
        else
          exec dsh web --host 127.0.0.1 --port "$DSH_PORT" --no-open
        fi
      ) &
      DSH_PID=$!
    fi
    sleep 15
  done
) &

exec nginx -c /tmp/nginx.runtime.conf -g 'daemon off;'
