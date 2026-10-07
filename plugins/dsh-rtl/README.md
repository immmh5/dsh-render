# dsh-rtl

Right-to-left / left-to-right switch for the DeepSeek Harness **web** GUI.

Adds a **Text direction** row directly under
**Settings → General → Language** with exactly three choices — `RTL`, `AUTO`
and `LTR` — drives `<html dir>`, mirrors the chrome, keeps code / terminal /
diff / JSON / path panes left-to-right, and applies idempotent on-disk fixes
for the drag handles, the timeline scroll and the attachment carousel.

`AUTO` keeps the shell right-to-left while every text block that reads mostly
English flips itself to left-to-right (AI answers, lists, quotes, the composer
while you type English). Its knobs live in their own settings section,
**Settings → Text direction (auto)** (section id `direction-auto`, order 93),
folded into seven groups — mode, zones, detection, behaviour, override rules,
selectors and import/export — so nothing is hidden but nothing crowds the
panel either.

The default is derived from the current language once (Arabic → RTL,
English → LTR) and is persisted the first time you pick any option.

## Install

One command, re-runnable any time (also after a Harness update):

```sh
~/.dsh/plugins-src/dsh-rtl/install.sh
```

It runs, in order:

1. `python3 build.py` — regenerates `lib/client.js` (locales + mirrored RTL CSS).
2. `dsh plugin --profile web add file:$DIR` — registers the plugin with the web profile.
3. `python3 patch_harness.py` — applies 12 guarded, hash-verified fixes to the
   installed Harness client bundles (backups in `assets/backup/`).
4. restarts `dsh-web` in the background (log: `/tmp/dsh-web-rtl.log`).

Skip the restart with `NO_RESTART=1 install.sh`.

## Verify after the restart

- `<html dir="rtl">` (or `ltr`) once you switch the row; in `AUTO` the shell
  stays `rtl` while message paragraphs gain `dir="ltr"` + `data-dsh-auto-dir`.
- Sidebar, borders, panels and both drag handles mirror correctly; dragging still works.
- Popups — language/permission pickers, menus, tooltips — open against the
  button they belong to, not pinned to a screen edge.
- Chat auto-scroll, the attachment carousel, the trajectory, and breadcrumb/Miller scrolling still behave.
- Code, terminal, diff, JSON and file paths stay left-to-right.
- The row sits directly under **Language**, offering `RTL` / `AUTO` / `LTR`.
- With `AUTO` selected, the section below shows the seven groups listed under
  **Settings** — four open by default, three folded.

## Settings

Everything below lives under `settings.direction` (host namespace `direction`),
is editable from the section UI, survives restarts, and can be copied out as
JSON and pasted back on another machine (**Import / export** group).

| group | field | default | what it does |
| --- | --- | --- | --- |
| Mode | `preference` | language | `rtl` \| `auto` \| `ltr` — the same three choices as the General row |
| Where it applies | `autoContent` | `true` | flip mostly-English chat blocks |
| | `autoComposer` | `true` | flip the composer while typing |
| | `composerMode` | `auto` | `auto` follows the probe; `rtl`/`ltr` pins the composer no matter what you type |
| | `autoSidebar` | `false` | also judge sidebar session titles |
| | `islandEnabled` | `true` | keep `pre`/code/JSON/diff/paths marked left-to-right |
| Detection | `threshold` | `60` | Latin share (40–95 %, step 5) required to flip |
| | `minLetters` | `8` | letters needed before a block is judged (1–64) |
| | `maxLetters` | `0` | skip blocks longer than this; `0` = no cap |
| | `flipMixed` | `true` | off ⇒ text mixing both scripts stays right-to-left |
| | `countDigits` | `false` | count `0–9` as Latin and `٠–٩` as Arabic evidence |
| Behaviour | `debounce` | `200` | ms to wait after a page change (0–2000, `0` = immediate) |
| | `observe` | `true` | MutationObserver on the thread (off = re-probe only on settings changes) |
| | `reactToInput` | `true` | re-probe the composer on `input`/`beforeinput` |
| | `debug` | `false` | print every decision as `[dsh-rtl] …` to the console |
| Override rules | `forceLtrSelector` | empty | newline-separated selectors pinned left-to-right |
| | `forceRtlSelector` | empty | newline-separated selectors pinned right-to-left |
| | `ignoreSelector` | empty | newline-separated selectors the probe never touches |
| Selectors | `scopeSelector` | `[data-conversation-scroll]` | container the message probe scans |
| | `composerSelector` | `[data-composer-input]` | element the typing probe drives |
| | `scanSelector` | `p,li,…,div,span` | candidates visited inside the scope |
| | `blockSelector` | `p,li,…` | tags allowed to carry a flipped `dir` (leaf `div`/`span` always qualify) |
| | `islandSelector` | `pre, code, [data-files-path]` | elements forced left-to-right while islands are on |
| | `sidebarSelector` | `[data-side="sidebar"] [role="treeitem"]` | rows probed when `autoSidebar` is on |

Precedence inside the probe: **your own rules first** (ignore → force LTR →
force RTL), then the LTR islands, then the structural guards
(`flex`/`grid`/`table`, non-inline children, foreign `dir`), then the letter
probe. An empty selector field falls back to the default, an invalid one is
skipped (watch `debug` if nothing flips).

## Layout

| file | role |
| --- | --- |
| `lib/index.js` | host half — registers the durable `direction` settings namespace |
| `lib/client.template.js` | browser half source (placeholders for CSS + locale dicts) |
| `lib/client.js` | generated browser half (never edit by hand) |
| `gen_rtl.py` | CSS mirror generator → `assets/rtl.css`, `assets/rtl-report.txt` |
| `build.py` | template substitution + validation (`--check` for CI) |
| `patch_harness.py` | 12 on-disk direction fixes (`--dry-run`, `--revert`) |
| `assets/row.css` | styles for the settings row + AUTO section |
| `assets/driver.css` | handle / text-zone / row layout fixes |
| `assets/rtl.css` | generated RTL override layer |
| `locales/{en,ar,zh}.json` | `direction.*` — 74 keys: title, modes, section, every knob + hint |
| `test/client.test.mjs` | 81 assertions: AUTO probe units, coercion/import, row/section server render |

## How it works

- **Direction source of truth** — `settings.direction.preference`
  (`rtl` | `auto` | `ltr`), written through `ctx.settingsScope`. If that read
  fails, `localStorage` carries the choice so the button always works.
  `auto` always forces the shell itself to `rtl`.
- **AUTO probe** — inside `scopeSelector` each candidate from `scanSelector` is
  scored by counting Arabic letters against `\p{L}` letters (digits only count
  when `countDigits` is on). A block flips to `ltr` when the Latin share reaches
  `threshold` and it holds between `minLetters` and `maxLetters` letters — and,
  with `flipMixed` off, mixed-script text stays `rtl` no matter the share. Only
  tags listed in `blockSelector` (plus leaf `div`/`span`) may carry the flipped
  `dir`, and `flex`/`grid`/`table` layouts, foreign `dir`s and
  `data-dsh-text-zone` islands are never touched. The plugin only ever writes
  `dir` it set itself (`data-dsh-auto-dir`); leaving `AUTO` clears every forced
  direction. The composer (`composerSelector`) follows the same probe unless
  `composerMode` pins it, `autoSidebar` extends the probe to session titles, and
  every one of these is a settings field — see **Settings** above.
- **Mirroring** — `gen_rtl.py` rewrites every physical `left`/`right` declaration
  (`border-*`, `inset`, `margin`, `padding`, `border-radius`, `text-align`,
  `background-position`, `transition`, …) under an `html[dir="rtl"]` prefix,
  preserving `@media` / `@keyframes` structure. 325 rules, 8 island classes
  (code, terminal, diff, JSON, paths) pinned with `!important` isolation.
  Physical offsets (`left`/`right`/`top`/`bottom`) deliberately stay
  `!important`-free: the Harness positions portals with *inline* styles, and
  `!important` would beat them and pin popups to a screen edge.
- **Popups** — the menu's end edge is the left edge under RTL (and a `right`
  side opens leftwards), so the portalled-menu geometry, the tooltip side and
  the status card offset are taught about `<html dir="rtl">`. The mirrored
  menu rule is additionally scoped with `:not(.portal)` so it never fights the
  JS-computed position.
- **Drag handles** — the inline `style.left` of each `[data-side]` handle is
  mirrored onto `--dsh-h-start`, which RTL reads as `right`, and the two drag
  callbacks flip the sign of the delta under RTL.
- **Scroll arithmetic** — `railPos = rtl ? -scrollLeft : scrollLeft` keeps the
  arrow/edge logic textually identical in both directions, and `scrollTo`
  targets negate under RTL.

## Test

```sh
node ~/.dsh/plugins-src/dsh-rtl/test/client.test.mjs   # AUTO probe + row/section render
python3 ~/.dsh/plugins-src/dsh-rtl/build.py --check    # locales parity + generated bundle
```

## Undo

```sh
python3 ~/.dsh/plugins-src/dsh-rtl/patch_harness.py --revert   # restores backed-up Harness files
dsh plugin --profile web remove dsh-rtl                         # then restart dsh-web
```

## Requirements

- `python3`, `bash`, `dsh` CLI on `PATH` (or `~/.npm-global/bin/dsh`).
- No Node toolchain needed: the bundle is plain browser JS registered through
  `dsh.client` / `exports["./client"]`.
