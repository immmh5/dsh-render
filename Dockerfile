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

# Install the dsh CLI globally from the public npm registry.
RUN npm install -g @deepseek-ai/dsh

# nginx bridges Render's public port to dsh on loopback (see start.sh).
RUN apt-get update && apt-get install -y --no-install-recommends nginx && rm -rf /var/lib/apt/lists/*

# Persistent DSH_HOME lives on the Render disk (mounted at /data).
ENV DSH_HOME=/data
ENV HOST=0.0.0.0

WORKDIR /workspace
EXPOSE 3080

COPY start.sh /usr/local/bin/start.sh
COPY nginx.conf /app/nginx.conf
RUN chmod +x /usr/local/bin/start.sh

CMD ["/usr/local/bin/start.sh"]
