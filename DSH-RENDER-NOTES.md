# DeepSeek Harness on Render — self-hosted

Your own copy of DeepSeek Harness (dsh) running in the cloud, reachable from
any device, independent of your local machine.

  URL:      https://dsh-78go.onrender.com
  Repo:     https://github.com/immmh5/dsh-render
  Service:  https://dashboard.render.com/web/srv-davmc6jncjis73eukfl0

## How to log in

There is a dedicated login page at:

    https://dsh-78go.onrender.com/login

dsh's web UI mints a rotating security code (the "launch token") at every boot
and prints it to the server logs — it is the ONLY thing standing between your
harness (which can run code and read files) and the public internet. Get the
current code from:

  Render Dashboard → the dsh service → Logs

Look for the line near boot:

    dsh web: http://127.0.0.1:13080/?token=XXXXXXXX

Paste that code into the login page and submit. Under the hood this is exactly
dsh's native exchange: the form GETs `/?token=<code>`, dsh validates it and
answers `303 → /` plus a `Set-Cookie`, so the browser ends on the app with a
session cookie and the token is consumed. The whole flow is dsh's own — no
custom auth code runs anywhere.

Each reboot mints a new code, so bookmark the **login page** (or the logs
page), never a token URL. The cookie is valid for 30 days and is bound to the
public hostname, so it survives redeploys and sleep/wake cycles; the *code*
does not.

Multiple devices / browsers each paste the same code once and each get their
own independent cookie — the code is not single-use in the sense of "one
device only", it is single-use per *exchange* (a fresh boot invalidates the
old one).

If you submit a wrong or stale code you stay on the login page and it tells
you so; the app is only reachable through a valid cookie.

## What is deployed

A clean, current `@deepseek-ai/dsh` from the public npm registry (MIT-licensed),
booted with the default `web` profile (dsh-base + dsh-web-app). Nothing from
your local `~/.dsh` was uploaded — this is a fresh install, by design.

## IMPORTANT — the Models / Settings pages cannot work on a public URL

This is NOT a bug and NOT a database problem. It is a deliberate security
design in dsh (`dsh-client-ui-settings`):

    persistence = ctx.remote.$host.isLoopback ? "host" : "memory"

The Settings/Models page only loads its provider directory when the page origin
is loopback (localhost / 127.0.0.1 / [::1]). From `dsh-78go.onrender.com`,
`isLoopback` is false, so the describe mirror stays in `"memory"` mode and never
asks the host for the settings document -> `view === undefined` ->
"settings are unavailable in this browser" / "Loading the provider directory
failed". `TRUSTED_HOST` does not change this — it only gates the API fence
(server-side `isTrustedApiRequest`), not the client-side `isLoopback` check.
Nothing you set in a database or env var will make these UI pages load remotely.

Therefore: **configure providers server-side, never through the UI on Render.**

## IMPORTANT — it has no model provider configured

A fresh dsh has no LLM key. Because the Settings UI is unusable on a public
origin (see above), the provider is configured through environment variables.
The DeepSeek plugin resolves, in order:
  1. credentials service (`inherited(ref)`) -> process env `DEEPSEEK_API_KEY`
     wins first, before even the credentials file
  2. `$DSH_HOME/.credentials.yaml`
  3. project/user `.env`
and for the endpoint: `settings.yaml baseURL` > `DEEPSEEK_BASE_URL` env >
`https://api.deepseek.com`.

So the ONLY thing needed to make chat work is one env var with no spaces:

    DEEPSEEK_API_KEY=sk-............

Optional, only if not using the official DeepSeek endpoint:

    DEEPSEEK_BASE_URL=https://openrouter.ai/api/v1

Caveat: if `$DSH_HOME/settings.yaml` already has an `llm-deepseek` section with
a `baseURL` (e.g. the old FreeLLMAPI one), that value OVERRIDES the env var.
Check it in the Render shell (`cat /data/settings.yaml`) and delete the
`llm-deepseek` block, or set `baseURL` there to match the new endpoint. If you
switch to OpenRouter, the default model catalog (deepseek-flash / deepseek-v4-*
ids) will not match OpenRouter ids, so also declare the models list in
settings.yaml.

## IMPORTANT — maxTokens must not exceed the provider's limit

A restored settings.yaml can carry a model `maxTokens` larger than its provider
accepts. This is easy to hit: the values are per-model, and a snapshot written
under one provider's limit (or hand-edited) is restored verbatim. The failure
is loud but confusing — Atria answers any `max_tokens` above 65536 with

    400: max_tokens must be an integer between 1 and 65536.

and the agent loop surfaces it as `provider_bad_request` for the whole turn,
so a chat that should work looks like the model is broken when only the limit
is wrong.

`sanitize-settings.mjs` (run from start.sh after the restore, before dsh boots)
clamps each listed provider's models to its real ceiling. Add a provider to
`CEILINGS` there when you wire one with a smaller limit than 131072. It is
idempotent and never fails the boot — a bad or missing settings.yaml is a
no-op, and the file keeps its original mode (dsh refuses group-readable
config).

## Persistence — Supabase Storage (free tier)

This service is on the free plan, which has NO persistent disk. Everything dsh
writes (settings, providers, sessions, conversation history, skills) lives in
the container's filesystem and is WIPED on every:
  - redeploy (auto-deploy fires on every push to main)
  - sleep/wake (free services sleep after ~15 min of inactivity)

To survive this, `sync.js` mirrors /data into a Supabase Storage bucket:

  Project:  jzuppyvyhcigmbwcwemn
  Bucket:   dsh-data
  Keys are in the service's env vars (SUPABASE_URL / SUPABASE_SERVICE_KEY /
  SUPABASE_BUCKET).

The lifecycle in start.sh:

  1. Restore  — on boot, BEFORE dsh starts, sync.js downloads everything under
                /data from the bucket. Boots are therefore stateful.
  2. Upload   — a background loop runs `sync.js sync` every 60s, so the bucket
                tracks what dsh is writing. A hard kill can lose at most ~60s.
  3. SIGTERM  — on a graceful redeploy, one final sync runs before the old
                container is replaced.

The marker file `data/.snapshot_marker` holds the timestamp of the last upload.
It is restored-skipped (it only exists to distinguish "empty bucket, fresh
install" from "nothing synced yet"), and `logs/` / `node_modules` / sqlite
sidecar files are excluded so the bucket stays small and fast.

NOTE on file modes: dsh refuses to boot if /data/.credentials.yaml is
group/world readable. Supabase does not store unix modes, so sync.js restores
dotfiles + yaml/json as 0600 and everything else as 0644. If you add a new
secret to /data by hand inside the container, `chmod 600` it.

If Supabase is ever unreachable the service still boots — restore failures are
non-fatal and it falls back to a fresh empty /data.

## Keeping the service awake

Free services sleep after ~15 min of no inbound traffic. `.github/workflows/
keepalive.yml` is a GitHub Actions cron that curls the URL every 10 minutes
(secret `DSH_HEALTH_URL` in the repo). A 401 counts as healthy — dsh's trust
fence rejects anonymous API calls, but the response proves nginx and dsh are
both serving. Runs are ~30s of compute each, far under the free Actions quota.

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
Render's health check would otherwise fail the deploy), serves the static
/login page (nginx answers 200 there even while dsh is still booting, so the
login page is the very first thing that becomes reachable on a fresh deploy),
intercepts dsh's 401 on the exact root `/` to render that same login page
(scoped to `location = /` so API/SSE 401s elsewhere keep their real status for
the frontend to handle), and preserves the WebSocket/SSE upgrade for streaming
responses.

## The `telegram-duty` bot and the 409 Conflict

`@luzhengyangtx/dsh-telegram-duty` is installed as a third-party plugin in the
web profile. It is the Telegram bridge that reaches your phone.

**The 409 Conflict is the one trap here.** Telegram's Bot API returns
`409 Conflict: terminated by other getUpdates request` whenever *two* processes
long-poll the same bot token — it is an account-wide lock, one consumer per bot.
Local `dsh` and Render both run this plugin, so they MUST NOT both poll. This is
solved by a repo convention, not by a flag in a config file:

  - **Render** uses the pristine npm package (v0.5.0), whose schema has **no**
    `poll` field at all — adding one fails validation. Its default is to poll,
    so Render owns the queue. The profile in this repo therefore OMITS `poll`.
  - **Local** runs a patched plugin (in `plugins-src/` on your machine) that
    adds `poll` to the schema, and the local `cordis.patch.yml` sets
    `poll: false`. Local watches/webhooks only, never long-polls.

Never set `poll: true` locally, and never add a `poll:` line to
`profile/cordis.patch.yml` (it would crash the boot with a schema error — the
npm package does not know the field). If both instances ever seem to fight over
the bot, the fix is always: local `poll: false`, Render no `poll` key at all.

## The web profile lives in this repo (`profile/`)

The web profile is defined in the repo, not in the container — it is the single
source of truth for which plugins the Render instance loads:

    profile/package.json      — the profile manifest: bundles list + name
    profile/cordis.patch.yml  — the `telegram-duty` plugin config (chat id, dirs)

Both are copied into `$DSH_HOME/profiles/web/` by `install_profile()` in
start.sh, which runs *after* the Supabase restore. `profiles/` is in the SKIP
list of sync.js, so the bucket never contains a `profiles/` snapshot and a
restore can never clobber the repo definition. The plugin itself is installed
at **image build time** (`COPY profile/package.json` → `pnpm install`) into
`/opt/dsh-profile`, then `install_profile` copies `node_modules/` in at boot —
the free plan's container has a fragile network, and a boot-time npm fetch
(plus its native-build step) is exactly the kind of thing that fails there.

**The bot token is NEVER committed.** In `cordis.patch.yml` it is written as

    token: !!js process.env.TELEGRAM_DUTY_TOKEN

dsh's YAML loader resolves the `!!js` tag at boot into
`process.env.TELEGRAM_DUTY_TOKEN`, and the token only ever exists in Render's
dashboard env vars. (The `role("secret")` redaction you may see in dsh's own
settings applies only to what the LLM/API output — the runtime value stays
intact, so the bot does receive a real token.) The chat id is a public value
and is committed as a literal.

The `@deepseek-ai/*` packages are NOT in the profile's `dependencies` on
purpose: dsh supplies them at boot via its module-fallback symlinks (host
copy), which also guarantees only one copy of each loads — a duplicate copy
makes two distinct `Symbol()` registries and breaks tool scheduling.

## Files in the deployment repo

  Dockerfile                  — node:22-slim + pnpm + git + build tools, npm-installs dsh
  start.sh                    — restores /data, sanitizes settings, installs the profile, boots dsh, syncs, nginx
  nginx.conf                  — the reverse proxy + /health endpoint (port placeholders)
  sync.js                     — the Supabase Storage sync (restore / sync-up / marker)
  sanitize-settings.mjs       — clamps model maxTokens to each provider's real limit before dsh boots
  profile/package.json        — the web profile manifest (bundles list)
  profile/cordis.patch.yml    — telegram-duty config; token via !!js process.env
  .github/workflows/keepalive.yml — cron pinging the URL so it does not sleep
