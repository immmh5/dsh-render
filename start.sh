#!/bin/sh
set -e

# Render assigns PORT and proxies HTTPS to it. nginx listens on that port on
# all interfaces; dsh's web UI stays on loopback (it refuses 0.0.0.0 by design
# to avoid exposing remote code execution to the network).
: "${PORT:=3080}"
DSH_PORT="${DSH_PORT:-13080}"
export NGINX_PORT="$PORT"

# Where dsh keeps settings, sessions, and skills. This is the free plan, so the
# container filesystem is ephemeral — /data is kept alive in a Supabase Storage
# bucket by sync.js and restored here on every boot.
: "${DSH_HOME:=/data}"
export DSH_HOME

# Render's public hostname (e.g. dsh-xxxx.onrender.com) for dsh's /api
# browser-trust fence.
TRUSTED="${TRUSTED_HOST:-}"

# nginx.conf has placeholders (nginx cannot expand env vars in listen/
# proxy_pass), so render the real config here and hand nginx the result.
sed -e "s/__NGINX_PORT__/${PORT}/g" -e "s/__DSH_PORT__/${DSH_PORT}/g" \
  /app/nginx.conf > /tmp/nginx.runtime.conf

HAVE_SUPA=0
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_KEY:-}" ] && [ -n "${SUPABASE_BUCKET:-}" ]; then
  HAVE_SUPA=1
fi

# Persistence: restore the last snapshot BEFORE dsh boots, so it reads the
# settings and sessions it had before the redeploy.
if [ "$HAVE_SUPA" = "1" ]; then
  echo "[dsh] restoring state from Supabase bucket ${SUPABASE_BUCKET}"
  node /app/sync.js restore || echo "[dsh] restore failed; continuing with empty home"
else
  echo "[dsh] Supabase not configured; starting with ephemeral storage"
fi

# Clamp model maxTokens to each provider's real limit. A restored snapshot can
# carry an oversized value (Atria rejects anything above 65536 and fails the
# whole turn with "max_tokens must be an integer between 1 and 65536").
echo "[dsh] sanitizing settings"
node /app/sanitize-settings.mjs || true

# Materialize the web profile. This repo is the single source of truth for the
# profile definition (package.json + cordis.patch.yml, token via the !!js tag,
# so no secret is committed). profiles/ is excluded from the Supabase sync in
# both directions, so a restored snapshot can never clobber it. The
# @deepseek-ai/* packages are supplied by dsh's own module-fallback symlinks
# created at boot; the third-party plugin (telegram-duty) was installed at
# image build time under /opt/dsh-profile and is copied in here.
# pinned exact version to install, not a range). dsh 0.2.0-rc.2 gates plugins
# on peerDependencies, and dsh-telegram-duty@0.5.0 predates it, so it is
# refused without an exact-version exemption. compatibility.json lives here
# and is installed with the profile; dsh reads it from the profile directory.
install_profile() {
  local target="$DSH_HOME/profiles/web"
  mkdir -p "$target"
  cp -f /app/profile/package.json "$target/package.json"
  cp -f /app/profile/cordis.patch.yml "$target/cordis.patch.yml"
  cp -f /app/profile/compatibility.json "$target/compatibility.json" || echo "[dsh] no compatibility.json bundled; plugins may be gated by peer ranges"
  if [ -d /opt/dsh-profile/node_modules ]; then
    rm -rf "$target/node_modules"
    cp -a /opt/dsh-profile/node_modules "$target/node_modules"
  else
    echo "[dsh] WARNING: /opt/dsh-profile/node_modules missing; plugins will not load"
  fi
  echo "[dsh] profile installed (telegram-duty: $(test -e "$target/node_modules/@luzhengyangtx/dsh-telegram-duty" && echo present || echo MISSING))"
}

install_profile

boot_dsh() {
  if [ -n "$TRUSTED" ]; then
    exec dsh web --host 127.0.0.1 --port "$DSH_PORT" --no-open --trusted-host "$TRUSTED"
  else
    exec dsh web --host 127.0.0.1 --port "$DSH_PORT" --no-open
  fi
}

echo "[dsh] starting: nginx 0.0.0.0:${PORT} -> dsh 127.0.0.1:${DSH_PORT} (trusted: ${TRUSTED:-none})"

boot_dsh &
DSH_PID=$!

# Persistence: push state back to Supabase on a timer. dsh writes settings and
# sessions as you use it; this snapshots them so the next boot restores them.
# Every 60s, so the last ≤60s of activity is the window a hard redeploy can lose.
if [ "$HAVE_SUPA" = "1" ]; then
  (
    while true; do
      sleep 60
      node /app/sync.js sync || echo "[dsh] periodic sync failed"
    done
  ) &
fi

# Keep dsh alive: if it crashes, restart it so the UI stays reachable.
(
  while true; do
    if ! kill -0 "$DSH_PID" 2>/dev/null; then
      echo "[dsh] process exited; restarting in 5s"
      sleep 5
      boot_dsh &
      DSH_PID=$!
    fi
    sleep 15
  done
) &

# A last upload when Render sends SIGTERM (a redeploy), so the next boot picks
# up the very latest state instead of waiting for the 60s tick.
if [ "$HAVE_SUPA" = "1" ]; then
  trap 'echo "[dsh] SIGTERM: final sync"; node /app/sync.js sync 2>/dev/null || true; exit 0' TERM INT
fi

exec nginx -c /tmp/nginx.runtime.conf -g 'daemon off;'
