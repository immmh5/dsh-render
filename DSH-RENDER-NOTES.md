# DeepSeek Harness on Render — self-hosted

Your own copy of DeepSeek Harness (dsh) running in the cloud, reachable from
any device, independent of your local machine.

  URL:      https://dsh-78go.onrender.com
  Repo:     https://github.com/immmh5/dsh-render
  Service:  https://dashboard.render.com/web/srv-davmc6jncjis73eukfl0

## How to log in

dsh's web UI mints a single-use access token at every boot and prints it to the
server logs — it is the ONLY thing standing between your harness (which can run
code and read files) and the public internet. Get the current token from:

  Render Dashboard → the dsh service → Logs

Look for the line near boot:

    dsh web: http://127.0.0.1:13080/?token=XXXXXXXX

Then open `https://dsh-78go.onrender.com/?token=XXXXXXXX` once. That exchanges
the one-time token for a session cookie; subsequent visits to the plain URL
work until the cookie expires. Each reboot mints a new token, so bookmark the
logs page, not a token URL.

## What is deployed

A clean, current `@deepseek-ai/dsh` from the public npm registry (MIT-licensed),
booted with the default `web` profile (dsh-base + dsh-web-app). Nothing from
your local `~/.dsh` was uploaded — this is a fresh install, by design.

## IMPORTANT — it has no model provider yet

A fresh dsh has no LLM configured. When you open the UI it will have no provider
to talk to. You said you would add the rest yourself; this is exactly that step.
Your options:

  1. Point it at your FreeLLMAPI gateway (recommended — it is already running
     and free):
       Provider route settings in the dsh UI, or edit
       $DSH_HOME/settings.yaml inside the service, with:
         baseURL: https://freellmapi-4khz.onrender.com/v1
         key:     freellmapi-88414600f1f70c36fc13dbea368b3216c2ad6ee5f9655af5
     (FreeLLMAPI still needs provider keys added on its own dashboard before it
     can answer — see the FreeLLMAPI notes.)
  2. Add any OpenAI-compatible provider directly (Atria, OpenRouter, etc.).

Settings live in /data (the DSH_HOME) — see the persistence note below.

## Persistence — free plan caveat

This service is on the free plan, which has NO persistent disk. Everything dsh
writes (settings, providers, sessions, conversation history, skills) lives in
the container's filesystem and is WIPED on every:
  - redeploy (auto-deploy fires on every push to main)
  - sleep/wake (free services sleep after ~15 min of inactivity)

So expect to re-add your provider keys after each update. Two ways to stop that:

  1. Upgrade to Starter ($7/mo) and attach a persistent disk at /data —
     settings and sessions then survive redeploys and sleep.
  2. Keep the free plan but re-apply settings after each deploy.

## Automatic updates (same pattern as FreeLLMAPI)

Render auto-deploy is ON: every push to `main` on immmh5/dsh-render rebuilds.
There is no upstream-sync workflow on this repo on purpose — the npm package is
pinned to whatever `npm install -g @deepseek-ai/dsh` resolves at build time, so
to update dsh just trigger a manual redeploy (Dashboard → Manual Deploy), or
push any commit. If you want a scheduled "update to latest dsh" action like the
FreeLLMAPI one, that is a small addition.

## Architecture note (why nginx is in the picture)

dsh's web app refuses `--host 0.0.0.0` by design — the CLI rejects it with
"would expose remote code execution to the network", and its config schema only
accepts 127.0.0.1 or 0.0.0.0 (no IPv6 `::`). Since Render's proxy needs an
all-interface bind, the container runs nginx as a bridge:

    Render proxy → nginx (0.0.0.0:$PORT) → dsh (127.0.0.1:13080)

nginx also serves /health itself (dsh takes ~25s to boot its plugin tree, and
Render's health check would otherwise fail the deploy), and preserves the
WebSocket/SSE upgrade for streaming responses.

## Files in the deployment repo

  Dockerfile   — node:22-slim + pnpm + git + build tools, npm-installs dsh
  start.sh     — boots dsh on loopback, supervises it, starts nginx
  nginx.conf   — the reverse proxy + /health endpoint (port placeholders)
