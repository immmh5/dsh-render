# DeepSeek Harness (dsh) — self-hosted web UI on Render.
# MIT-licensed (Copyright (c) 2026 DeepSeek); the npm packages are public.
FROM node:22-bookworm-slim

# dsh-computer-use / node-pty / koffi compile native modules at install time,
# so a C++ toolchain + python3 are needed. git is required for any GitHub-
# hosted plugin you add later.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@11.26.0 --activate

# Install the dsh CLI globally from the public npm registry. Pinned to
# 0.1.5-rc.2: dsh-telegram-duty@0.5.0 is the plugin's latest release and its
# peerDependencies all target ^0.1.5-rc.2. Newer dsh runtimes (0.2.0-rc.2)
# both refuse it on peer ranges and break its mount with
# "ctx.settings.register is not a function" once exempted. Pin until the
# plugin publishes a release compatible with a newer dsh.
#
# The node:22 image ships npm 10.9.9, whose global installer silently drops
# transitive deps of *nested* packages — dsh-base's dsh-sandbox-local and its
# deps never land in node_modules, and dsh then dies at boot with
# "dsh-sandbox-local ... could not be resolved". npm 12 also drops them when
# they're only reached transitively, so the three packages are installed
# explicitly at the top level of the global tree. That is resolvable by the
# same node_modules walk-up dsh uses for its nested copies: the global root
# /usr/local/lib/node_modules is itself a node_modules directory.
RUN npm install -g npm@12.2.0 \
  && npm install -g @deepseek-ai/dsh@0.1.5-rc.2 \
  && npm install -g @deepseek-ai/dsh-sandbox-local@0.1.5-rc.2 \
  && npm install -g @deepseek-ai/dsh-sandbox-windows-acl@0.1.5-rc.2 \
  && npm install -g @deepseek-ai/dsh-win32-process@0.1.5-rc.2

# Patch the duplicate-koffi crash. The pinned runtime mix above (dsh at
# 0.1.5-rc.2, but its nested subprocess/sandbox packages at 0.1.5-rc.3)
# leaves four physical copies of dsh-win32-process in the tree, and koffi
# registers its struct names in a process-global registry — the second copy
# to load throws "Duplicate type name 'DSH_STARTUPINFOW'" and `dsh web` dies
# before it binds a port. Bumping dsh is not an option (the plugin's peers
# only allow ^0.1.5-rc.2), so this swaps koffi for an inert stub on
# non-Windows hosts, where the Win32 FFI paths can never run anyway. The
# script is idempotent, so re-running it after any later reinstall is safe.
#
# Then the settings-loopback fix: on this deployment `dsh web` sits behind an
# nginx reverse proxy on a public hostname, so dsh-client-connection's
# isLoopback derivation is false and the client UI then refuses to read or
# write the host settings store ("settings are unavailable in this browser").
# The second script forces that one boolean true so the settings panels work
# over the proxy. See fix/fix-settings-loopback.sh for the full chain.
COPY fix/ /opt/dsh-fix/
RUN chmod +x /opt/dsh-fix/fix-dup-win32-process.sh \
  && chmod +x /opt/dsh-fix/fix-settings-loopback.sh \
  && /opt/dsh-fix/fix-dup-win32-process.sh \
  && /opt/dsh-fix/fix-dup-win32-process.sh \
  && /opt/dsh-fix/fix-settings-loopback.sh \
  && rm -rf /root/.npm

# nginx bridges Render's public port to dsh on loopback (see start.sh).
RUN apt-get update && apt-get install -y --no-install-recommends nginx && rm -rf /var/lib/apt/lists/*

# DSH_HOME is kept in a Supabase Storage bucket across redeploys and sleep/wake
# cycles — sync.js (invoked from start.sh) restores it on boot and uploads it
# on a timer, since the free plan's filesystem is ephemeral.
ENV DSH_HOME=/data
ENV HOST=0.0.0.0

WORKDIR /workspace
EXPOSE 3080

# Pre-install the web profile's third-party plugins at image build time. The
# free plan's container is ephemeral and a boot-time install is slow/fragile,
# so /opt/dsh-profile is baked here and start.sh copies it into $DSH_HOME on
# boot. dsh's own @deepseek-ai/* packages are supplied via the module-fallback
# symlinks created at boot, so only third-party deps live here.
#
# The three dsh-kit plugins (dsh-addons-manager, dsh-arabic, dsh-rtl) are
# vendored under /opt/dsh-plugins and pulled in as file: deps. Each ships a
# prebuilt lib/*.js, so no build step is needed here; the dsh-rtl harness
# patches and the dsh-arabic addon arabicization run below and again at boot
# (both are idempotent, so they are safe to re-run after a self-update).
COPY plugins/ /opt/dsh-plugins/
COPY profile/package.json /opt/dsh-profile/package.json
RUN cd /opt/dsh-profile \
  && pnpm install --no-frozen-lockfile --prod \
  && rm -rf /opt/dsh-profile/node_modules/.pnpm-store

# npm 12.2.0 nests the dsh-client-ui-* packages one level deeper than npm 11
# did: dsh-web-app's own deps land under
# <dsh>/node_modules/@deepseek-ai/dsh-web-app/node_modules/@deepseek-ai, while
# dsh-web-frontend stays at <dsh>/node_modules/@deepseek-ai. dsh-rtl's
# patch_harness.py requires all four patched packages reachable from one root,
# so hoist the three UI packages up to that root to match the npm 11 layout.
# The install above pins dsh, so this is stable; the move is guarded and a
# no-op if npm ever nests them at the top level again.
RUN UI=/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai \
  && NESTED=$UI/dsh-web-app/node_modules/@deepseek-ai \
  && for p in dsh-client-ui-layout dsh-client-ui-attachment dsh-client-ui-directory-picker-browse; do \
       [ -d "$NESTED/$p" ] && [ ! -e "$UI/$p" ] && mv "$NESTED/$p" "$UI/$p"; \
     done; true

# dsh-rtl: patch the harness bundles for correct RTL geometry (drag handles,
# rail edges, tooltip/dropdown placement). Anchors are validated against this
# exact dsh pin; the script is idempotent and fails loudly if a bundle moved.
# The harness tree is the global npm install (self-update only syncs /app and
# the fix scripts, so this never needs re-applying after a boot-time pull).
# Also arabicize telegram-duty's own strings (dsh-arabic patch_telegram.py),
# which is path-flexible and a no-op for any add-on that is not installed.
RUN cd /opt/dsh-plugins/dsh-rtl \
  && NO_RESTART=1 python3 patch_harness.py \
     --harness /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai \
  && cd /opt/dsh-plugins/dsh-arabic \
  && python3 patch_telegram.py --profile /opt/dsh-profile \
  && python3 patch_addons.py --profile /opt/dsh-profile

COPY start.sh /usr/local/bin/start.sh
COPY nginx.conf /app/nginx.conf
COPY sync.js /app/sync.js
COPY sanitize-settings.mjs /app/sanitize-settings.mjs
COPY login/index.html /app/login/index.html
COPY profile/package.json /app/profile/package.json
COPY profile/cordis.patch.yml /app/profile/cordis.patch.yml
RUN chmod 644 /app/login/index.html && chmod +x /usr/local/bin/start.sh

CMD ["/usr/local/bin/start.sh"]
