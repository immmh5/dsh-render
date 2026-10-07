# dsh-mcp-servers

MCP server manager for the [DeepSeek Harness](https://github.com/DeepSeek-AI/dsh) web GUI.

Adds a **Settings → MCP Servers** section that lists every MCP server registered
in the profile's `cordis.patch.yml`, with enable/disable toggles, an add/edit/delete
form (stdio / http / sse transports), live tool counts reported by the MCP client,
and one-click restart.

It is built on the same Typert Remote gateway shape as
[`dsh-addons-manager`](../dsh-addons-manager), so the host half owns the patch file
through `lib/yamlkit.mjs` + `lib/patchops.mjs` and the browser half is a single
settings section.

## Layout

```
dsh-mcp-servers/
├── lib/
│   ├── host.js          # Typert Remote gateway: snapshot/setEnabled/upsert/remove
│   ├── client.js        # browser half: settings section + forms (React, via dsh-client-ui)
│   ├── yamlkit.mjs      # parse / locateRow / parseConfig / writeConfig over cordis.patch.yml
│   └── patchops.mjs     # setEnabled / createRow / topLevelRows / isDisabled
├── test/
│   ├── yamlkit.test.mjs # pure unit tests — run anywhere
│   ├── patchops.test.mjs# pure unit tests — run anywhere
│   ├── client.test.mjs  # renders the section with mocked remotes
│   └── host.test.mjs    # live RPC round trip (skips offline)
├── cordis.patch.yml     # the patch row that mounts this plugin
└── install.sh
```

## How it works

1. **Boot.** `cordis.patch.yml` mounts this plugin's row at startup, so the host
   half is loaded before any MCP client.
2. **Discovery.** `snapshot()` walks `cordis.patch.yml`, keeps the rows whose
   `name` is `@deepseek-ai/dsh-mcp-client`, and reads each one's `config:` block
   for `serverName` / `transport` / `command` / `args` / `url`. Rows are
   discovered by id + config text — `topLevelRows()` intentionally returns no
   `name`, so `host.js` derives it with `readRowName()`.
3. **Live status.** With `live: true`, the gateway asks the MCP client service
   for each registered server's tool count; offline servers report `0` tools and
   a `down` status instead of throwing.
4. **Mutations.** Every write goes through `yamlkit`/`patchops` and keeps the
   patch file well-formed: `upsert` validates the transport against a fixed set
   and the id against a strict pattern, `setEnabled` writes/removes `disabled:
   true` rows, `remove` deletes the row. Nothing is written when validation
   fails — the gateway returns `{ ok: false, errors }` instead.

## Install

```sh
./install.sh
```

This syntax-checks and unit-tests the plugin, then registers it in the web
profile via `dsh plugin --profile web add file:…`. Restart dsh web and open
**Settings → MCP Servers**.

To run the tests individually:

```sh
node test/yamlkit.test.mjs   # pure
node test/patchops.test.mjs  # pure
node test/client.test.mjs    # render, no network
PORT=3099 node test/host.test.mjs   # live RPC (optional)
```

## Requirements

- dsh web with `@deepseek-ai/dsh-mcp-client` installed in the same profile
- Node 18+

## License

MIT
