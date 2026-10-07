# dsh-addons-manager

Bulk add-on manager for the **DeepSeek Harness** web GUI.

Adds a settings section named **«الإضافات بالجملة»** (order **94**) — directly
**above** the built-in **«إدارة الإضافات»** button (the extension hub, order
95) — with a multi-select add-on list, bulk enable/disable, and **bundle
export / import** of add-ons in one file. A second tab edits each add-on's own
`config:` block, a third holds the manager's own preferences.

It is a normal DSH profile plugin: one install command, one restart.

## Tabs

| Tab (Arabic) | Tab (English) | What it does |
| --- | --- | --- |
| **الإضافات** | Add-ons | filter + **checkbox multi-select**, select all / clear, **Enable selected** / **Disable selected**, **تصدير** (export) and **استيراد** (import) |
| **إعدادات الإضافات** | Add-on settings | pick any add-on and edit its `config:` block — a generated field form (scalars in place, arrays / empty objects as JSON) or raw JSON, plus **add a field** and **clear settings** |
| **إعداداتي** | My settings | the manager's own durable preferences |

Every write is reported with `pendingRestart`: the profile patch only takes
effect on the next `dsh web` start.

### Export bundle

**تصدير حزمة** downloads one JSON file:

```jsonc
{
  "format": "dsh-addons-manager.bundle",
  "version": 1,
  "plugins": [
    { "id": "telegram-duty", "name": "@luzhengyangtx/dsh-telegram-duty",
      "enabled": true, "version": "0.5.0",
      "installSpec": "^0.5.0", "sourceKind": "npm",
      "config": { "language": "ar", "watchMode": "local" } }
  ]
}
```

* **الكل / المحدَّد فقط** — export everything or only the ticked rows.
* **أرفق إعدادات كل إضافة** — include each `config:` block (on by default).
* **أرفق ملفات الإضافات نفسها** — for `file:` add-ons (like this plugin and
  `dsh-arabic`), walk `~/.dsh/plugins-src/<pkg>` and base64 the sources so the
  bundle is self-contained. Capped at 1 MiB / file and 8 MiB / bundle.

### Import bundle

**اختر ملف حزمة .json** validates the `format` field, then per add-on:

1. restores source files into `~/.dsh/plugins-src/<name>` (when present),
2. creates the profile row if it does not exist,
3. overwrites its `config:` block,
4. applies the enabled/disabled state.

Add-ons that are not yet in the profile's `package.json` dependencies come back
as **install commands** in the result message (`dsh plugin --profile web add …`);
run those, then restart.

## Enable / disable semantics

`cordis.patch.yml` is a composition **layer**, not a plain list: every bundle
declared in `dsh.profile.bundles` inserts its rows first, and a **bare
top-level row** (`- id: X` + `disabled: true`) is an **override** applied to
that row. So:

* disabling appends a toggle row inside this plugin's own managed region
  (`# >>> dsh-addons-manager` … `# <<< dsh-addons-manager`) — never inside the
  extension hub's region, which that manager regenerates wholesale,
* enabling removes only pure toggle rows (`id` + `disabled`) and prunes the
  region when it becomes empty,
* an add-on with its own `config:` row keeps it — a separate toggle row is
  added alongside, so a disable → enable round trip reproduces the original
  file byte for byte (covered by the test suite),
* ids no bundle inserts cannot be toggled this way; the API returns them as
  `warnings` instead of failing silently.

## Files

| File | Job |
| --- | --- |
| `lib/host.js` | `TypertRemoteService` gateway (`addonManager` namespace): `snapshot`, `setEnabled`, `getConfig`, `setConfig`, `exportAddons`, `importAddons`. Also registers the `addon-manager` settings namespace. |
| `lib/client.js` | browser half: mounts the Remote contribution, registers the `addonManager` locale dictionaries (`en` / `ar` / `zh`), injects `settings.section` with `id: addon-manager`, `order: 94`. |
| `lib/yamlkit.mjs` | YAML subset used to read/locate/write `config:` blocks without `js-yaml` (not resolvable from a profile plugin). Keeps `!!js …` tags verbatim. |
| `lib/patchops.mjs` | row/region algebra: `topLevelRows`, `setEnabled`, `createRow`, `writeConfig`, managed-region markers. |
| `test/*.test.mjs` | `node test/yamlkit.test.mjs` → 58 assertions; `node test/patchops.test.mjs` → 40 assertions. |
| `cordis.patch.yml` | `- insert: - id: addon-manager / name: dsh-addons-manager`. |

## Install

```sh
bash ~/.dsh/plugins-src/dsh-addons-manager/install.sh
```

or directly:

```sh
dsh plugin --profile web add file:~/.dsh/plugins-src/dsh-addons-manager
```

Then restart the web GUI (`dsh-web`). The section appears in
**Settings → الإضافات بالجملة**, above **إدارة الإضافات**.

`install.sh` runs `node --check` on every source file and both test suites when
`node` is on PATH.

## Own settings

Stored in `$DSH_HOME/settings.yaml` under the `addon-manager` namespace:

| Field | Default | Meaning |
| --- | --- | --- |
| `confirmBulk` | `false` | ask before bulk enable/disable and before imports |
| `exportConfig` | `true` | include `config:` blocks on export |
| `exportSources` | `false` | include add-on sources on export |
| `showDisabledOnly` | `false` | filter the list to disabled add-ons |
| `defaultTab` | `plugins` | tab opened first (`plugins` / `config` / `prefs`) |

## Uninstall

```sh
dsh plugin --profile web remove dsh-addons-manager
```

or remove the `addon-manager` row from
`~/.dsh/profiles/web/cordis.patch.yml` and the `dsh-addons-manager` entry from
its `package.json` / `dsh.profile.bundles`, then restart. The managed region
deletes itself with the plugin.
