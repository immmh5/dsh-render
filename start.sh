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

# --- Self-update ------------------------------------------------------------
# On the free plan, image builds are skipped whenever the service is suspended:
# GitHub's deploy webhook fires while the container is asleep, Render drops the
# build instead of queuing it, and the image silently drifts behind main. So
# boot time also pulls the repo and syncs the runtime files + fix scripts.
# That way the live container only ever needs a *restart* (sleep/wake, scaling,
# manual restart) to land on the current commit — no successful Render build
# required. The repo is public, so the clone needs no token. Outbound network
# can take a few seconds to come up on a cold free-plan boot, so the clone gets
# several tries before we give up — otherwise /opt/dsh-repo never materializes
# and restarts can no longer pick up main at all, defeating the safety net.
# Every step is best-effort and idempotent: a broken pull must not stop the UI
# from booting. start.sh itself is deliberately NOT synced over the running
# script.
if command -v git >/dev/null 2>&1; then
  if [ -d /opt/dsh-repo/.git ]; then
    git -C /opt/dsh-repo pull --ff-only --quiet >/dev/null 2>&1 \
      || echo "[dsh] self-update: pull failed; using last synced state"
  else
    ok=0
    for attempt in 1 2 3 4 5; do
      # Keep the clone's complaint: one trimmed line is enough to diagnose
      # (DNS, proxy, refused) and the log is the only visibility we have.
      if err=$(git clone --depth 1 --quiet https://github.com/immmh5/dsh-render.git /opt/dsh-repo 2>&1); then
        ok=1
        break
      fi
      # A half-finished clone would block every later retry, so clear it.
      rm -rf /opt/dsh-repo
      [ "$attempt" = 5 ] || sleep $((attempt * 3))
    done
    if [ "$ok" = 1 ]; then
      echo "[dsh] self-update: cloned"
    else
      echo "[dsh] self-update: clone failed after 5 tries; using image contents"
      echo "[dsh] self-update: last error: $(echo "$err" | tr '\n' ' ' | cut -c1-200)"
    fi
  fi
fi
if [ -d /opt/dsh-repo ]; then
  for f in nginx.conf sync.js sanitize-settings.mjs login/index.html \
           profile/package.json profile/cordis.patch.yml; do
    if [ -f "/opt/dsh-repo/$f" ]; then
      mkdir -p "/app/$(dirname "$f")"
      cp -f "/opt/dsh-repo/$f" "/app/$f" || true
    fi
  done
  mkdir -p /opt/dsh-fix
  if [ -d /opt/dsh-repo/fix ]; then
    for s in /opt/dsh-repo/fix/fix-*.sh; do
      [ -f "$s" ] || continue
      cp -f "$s" "/opt/dsh-fix/$(basename "$s")" || true
    done
    for s in /opt/dsh-fix/fix-*.sh; do
      [ -f "$s" ] || continue
      chmod +x "$s" 2>/dev/null || true
      "$s" || echo "[dsh] self-update: $(basename "$s") failed"
    done
  fi
  echo "[dsh] self-update: at $(git -C /opt/dsh-repo rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
fi
# --- end self-update --------------------------------------------------------

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
# dsh is pinned to 0.1.5-rc.2 (see Dockerfile) — the runtime the plugin's
# peers declare — so no compatibility exemption file is needed here.
install_profile() {
  local target="$DSH_HOME/profiles/web"
  mkdir -p "$target"
  cp -f /app/profile/package.json "$target/package.json"
  cp -f /app/profile/cordis.patch.yml "$target/cordis.patch.yml"
  if [ -d /opt/dsh-profile/node_modules ]; then
    rm -rf "$target/node_modules"
    cp -a /opt/dsh-profile/node_modules "$target/node_modules"
  else
    echo "[dsh] WARNING: /opt/dsh-profile/node_modules missing; plugins will not load"
  fi
  echo "[dsh] profile installed (telegram-duty: $(test -e "$target/node_modules/@luzhengyangtx/dsh-telegram-duty" && echo present || echo MISSING))"
}

install_profile

# Verify the runtime tree is complete. dsh resolves its nested plugins by
# walking up from /usr/local/lib/node_modules, so a top-level global install
# of any missing package is resolvable the same way its own nested copy would
# be. (Installing into dsh's own dir with --prefix does NOT work: npm then
# re-resolves dsh's devDependencies and aborts with ERESOLVE.)
G=/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai
T=/usr/local/lib/node_modules/@deepseek-ai
for p in dsh-sandbox-local dsh-sandbox-windows-acl dsh-win32-process; do
  if [ ! -d "$G/$p" ] && [ ! -d "$T/$p" ]; then
    echo "[dsh] WARNING: $p missing; installing globally"
    npm install -g --no-audit --no-fund "%%40deepseek-ai%%2f$p@0.1.5-rc.2" >/dev/null 2>&1 \
      || npm install -g --no-audit --no-fund "@deepseek-ai/$p@0.1.5-rc.2" || true
  fi
done
echo "[dsh] verify: $(node -e 'const fs=require("fs");const g="/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai";const t="/usr/local/lib/node_modules/@deepseek-ai";const w=["dsh-sandbox-local","dsh-sandbox-windows-acl","dsh-win32-process"];console.log(w.map(x=>x+":"+(fs.existsSync(g+"/"+x)||fs.existsSync(t+"/"+x)?"ok":"MISSING")).join(" "))')]"
echo "[dsh] verify: npm $(npm -v), node $(node -v), dsh $(node -e 'try{console.log(require("/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json").version)}catch(e){console.log("?")}')"

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
