# DeepSeek Harness (dsh) — self-hosted web UI on Render.
# MIT-licensed (Copyright (c) 2026 DeepSeek); the npm packages are public.
FROM node:22-bookworm-slim

# dsh-computer-use / node-pty / koffi compile native modules at install time,
# so a C++ toolchain + python3 are needed. git is required for any GitHub-
# hosted plugin you add later.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@11.26.0 --activate

# Install the dsh CLI globally from the public npm registry. Pinned to
# 0.1.5-rc.2: dsh-telegram-duty@0.5.0 is the plugin's latest release and its
# peerDependencies all target ^0.1.5-rc.2. Newer dsh runtimes (0.2.0-rc.2)
# both refuse it on peer ranges and break its mount with
# "ctx.settings.register is not a function" once exempted. Pin until the
# plugin publishes a release compatible with a newer dsh.
RUN npm install -g @deepseek-ai/dsh@0.1.5-rc.2

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
COPY profile/package.json /opt/dsh-profile/package.json
RUN cd /opt/dsh-profile \
  && pnpm install --no-frozen-lockfile --prod \
  && rm -rf /opt/dsh-profile/node_modules/.pnpm-store

COPY start.sh /usr/local/bin/start.sh
COPY nginx.conf /app/nginx.conf
COPY sync.js /app/sync.js
COPY sanitize-settings.mjs /app/sanitize-settings.mjs
COPY login/index.html /app/login/index.html
COPY profile/package.json /app/profile/package.json
COPY profile/cordis.patch.yml /app/profile/cordis.patch.yml
RUN chmod 644 /app/login/index.html && chmod +x /usr/local/bin/start.sh

CMD ["/usr/local/bin/start.sh"]
