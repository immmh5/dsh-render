# dsh-arabic

Arabic (`ar`) language pack for the **DeepSeek Harness** web GUI.

It is a normal DSH profile plugin: install it once and `العربية` appears in
**Settings → General → Language**. Uninstalling removes the language and every
translation with it. No Harness source file is patched, and nothing needs
re-editing after a Harness update — re-running the install command re-syncs the
plugin.

## What it does

| Half | File | Job |
| --- | --- | --- |
| host | `lib/index.js` | mount target for the bundle row (no side effects) |
| client | `lib/client.js` | `ctx.locale.addLanguage({ id: 'ar', label: 'العربية', fallback: 'en' })` then `ctx.locale.register(ns, 'ar', …)` for **45 namespaces / 1795 keys** |
| patch | `cordis.patch.yml` | `- insert: - id: dsh-arabic` — merged by the profile boot via `dsh.bundle.patch` |

Selection is stored in `$DSH_HOME/settings.yaml` under the `locale` namespace
(`preference: ar`), the same place the built-in `zh` / `en` preferences live.

### Namespaces covered

The 45 namespaces are the shipped UI **plus** the add-ons that already talk to
the locale service — those need no source patch, only an `ar` dictionary:

| Namespace | Add-on |
| --- | --- |
| `dsh-cron` (300 keys) | `@goodandready/dsh-cron` |
| `telegram-duty.banner` | `@luzhengyangtx/dsh-telegram-duty` |
| `extensionHub` (235 keys) | `dsh-extension-hub` (Settings → إدارة الإضافات) |

### Add-ons that ship their own i18n table

`dsh-free-search` keeps its dictionary **inside** `lib/client.js` and never
registers a namespace, so it cannot be translated from a dictionary file.
`patch_addons.py` edits that shipped source instead:

```sh
python3 ~/.dsh/plugins-src/dsh-arabic/patch_addons.py           # apply
python3 ~/.dsh/plugins-src/dsh-arabic/patch_addons.py --check   # verify anchors
python3 ~/.dsh/plugins-src/dsh-arabic/patch_addons.py --revert  # restore backup
python3 ~/.dsh/plugins-src/dsh-arabic/patch_addons.py --profile ~/other/profile
```

It writes a `dsh-arabic:addons v1` marker on the first run (later runs report
`already`), snapshots the pristine file to `assets/backup/` once, and fails
loudly if a future release moves one of its anchors. `install.sh` runs both the
build and this patch.

### Telegram-facing strings

The Telegram side never reaches the locale service either — the bot answers the
phone directly — so `patch_telegram.py` patches three add-ons:

| Add-on | What it rewrites |
| --- | --- |
| `@luzhengyangtx/dsh-telegram-duty` | adds an `ar` table to `lib/index.js` + `lib/types/i18n.js`, extends `stringsFor()` and the `language` config union (`zh \| en \| ar`), adds Arabic approval words to `ALLOW_WORDS` / `REJECT_WORDS`, and translates the tool line in the approval digest (`lib/types/gateway.js`) |
| `dsh-telegram-channel` | replaces the hard-coded Chinese `MSG` / `status` / `label` / `history` strings with Arabic |
| `@goodandready/dsh-cron` | Telegram task report labels and the inline keyboard (`Run Now` → `تشغيل الآن`, …) |

```sh
python3 ~/.dsh/plugins-src/dsh-arabic/patch_telegram.py           # apply
python3 ~/.dsh/plugins-src/dsh-arabic/patch_telegram.py --check   # verify anchors
python3 ~/.dsh/plugins-src/dsh-arabic/patch_telegram.py --revert  # restore backups
```

Same contract as `patch_addons.py`: a `dsh-arabic:telegram v2` marker, one-time
backup per file in `assets/backup/`, and anchor-based idempotency (a second run
reports `already`). Idempotency is checked by anchors, not by the marker alone,
so a file stamped by an older run still picks up new ops. `dsh-telegram-channel`
and `dsh-cron` additionally fail the run if any Chinese literal survives;
telegram-duty keeps its own `zh` table and the Chinese alternations in the
approval regexes by design.

The duty bot's `language` is then set to `ar` in
`$DSH_HOME/profiles/web/cordis.patch.yml` (`telegram-duty.config.language`) and
`$DSH_HOME/settings.yaml` (`telegram-duty.language`).

### The Telegram command menu

The `/` list (command + description) is stored **server-side by Telegram**, not in
any file — so it outlives the add-on that pushed it. A previously installed
`dsh-telegram-control` left a Chinese menu behind (`/agents`, `/jobs`, `/kill`,
`/watch`, …) and nothing was updating it any more. `push_tg_menu.py` replaces it
with the commands the live bot actually routes:

| Command | Description |
| --- | --- |
| `/help` | قائمة الأوامر والمساعدة |
| `/sessions` | عرض الجلسات الحيّة والتنقّل بينها |
| `/away` | تفعيل وضع الوردية (تصل الموافقات إلى هاتفك) |
| `/back` | العودة إلى الوضع المحلي (الموافقات في الويب) |
| `/duty` | العودة إلى المسار الافتراضي لجلسة الوردية |
| `/unblock` | إلغاء الجولات العالقة بسبب موافقات ويب لم تُجب |

```sh
python3 ~/.dsh/plugins-src/dsh-arabic/push_tg_menu.py            # install (needs network)
python3 ~/.dsh/plugins-src/dsh-arabic/push_tg_menu.py --check    # 0 = arabic, 1 = needs a push
python3 ~/.dsh/plugins-src/dsh-arabic/push_tg_menu.py --dry-run  # print, do not call the API
python3 ~/.dsh/plugins-src/dsh-arabic/push_tg_menu.py --revert   # restore the captured menu
```

The bot token is read from `telegram-duty.config.token` in the profile patch
(fallback: `$DSH_TELEGRAM_TOKEN`). The previous menu is saved once to
`assets/backup/tgmenu-prev.json`. The Bot API silently ignores a JSON body
here — an unparsed `commands` field becomes an *empty* menu — so the script
always posts `application/x-www-form-urlencoded`.

## Layout

```
dsh-arabic/
├── package.json          dsh.bundle.patch + dsh.client declarations
├── cordis.patch.yml      profile layer: insert the plugin row
├── build.py              merge + validate + emit lib/client.js
├── patch_addons.py       Arabicize add-ons that ship their own i18n table
├── patch_telegram.py     Arabicize the Telegram-facing add-on strings
├── push_tg_menu.py       install the Telegram `/` command menu in Arabic
├── install.sh            build + both patches + menu push + `dsh plugin add`
├── assets/
│   ├── freesearch-ar.js  Arabic I18N body injected into dsh-free-search
│   ├── tduty-ar.js       Arabic duty-bot table injected into telegram-duty
│   ├── tgchannel-ar.json zh → ar map injected into dsh-telegram-channel
│   └── backup/           pristine snapshots taken before the first patch
├── lib/
│   ├── index.js          host half
│   └── client.js         generated — the 45 Arabic dictionaries
└── locales/
    ├── en.json           source of truth (extracted from the installed build)
    ├── ar.json           generated merged Arabic
    └── ar-01..12.json    translation shards (edit these, then rebuild)
```

## Install / uninstall / update

```sh
# install / re-sync (build + Arabicize add-on sources + register the plugin)
~/.dsh/plugins-src/dsh-arabic/install.sh

# or just the registration step
dsh plugin --profile web add file:$HOME/.dsh/plugins-src/dsh-arabic

# uninstall
dsh plugin --profile web remove dsh-arabic
python3 ~/.dsh/plugins-src/dsh-arabic/patch_addons.py  --revert   # undo i18n patches
python3 ~/.dsh/plugins-src/dsh-arabic/patch_telegram.py --revert  # undo telegram patches
python3 ~/.dsh/plugins-src/dsh-arabic/push_tg_menu.py  --revert   # undo the command menu
```

Then restart the web app (`dsh-web`). After a Harness update, run `install.sh`
again and restart.

## Rebuilding after editing translations

```sh
python3 ~/.dsh/plugins-src/dsh-arabic/build.py --check   # validation only
python3 ~/.dsh/plugins-src/dsh-arabic/build.py           # regenerate lib/client.js
```

`build.py` fails loudly on: a missing/extra namespace or key, an empty
translation, a placeholder set that differs from the English source
(`{count}`, `{name}`, …), or a duplicate namespace across shards.

## Rules for translators

1. Keep every `{placeholder}` exactly as it is in `locales/en.json`.
2. Keep brand and technical tokens verbatim: `JSON`, `HTTP`, `PDF`, `API`,
   `TTFT`, `TPS`, `Cmd/Ctrl`, `settings.yaml`, `agent.cordis.yml`, `Cursor`,
   `VS Code`, `Finder`, …
3. Command names stay untranslated: `/plan`, `/compact`, `--patch`.
4. Do **not** change the wording of a key that is also a technical error code.
5. Edit `locales/ar-NN.json` only — never `lib/client.js`; it is generated.

## Scope and roadmap

This bundle is **translation only**, deliberately split from the RTL work so the
two ship independently:

* ✅ `ar` locale registration + full static translation of the shipped UI
* ✅ Arabic dictionaries for the locale-aware add-ons (`dsh-cron`,
  `telegram-duty`, `extension-hub`)
* ✅ `patch_addons.py` for add-ons that keep their own i18n table
  (`dsh-free-search`)
* ✅ `patch_telegram.py` for the bot-side strings that never touch the locale
  service (`telegram-duty` help/approvals/buttons, `dsh-telegram-channel`,
  `dsh-cron` task reports)
* ✅ `push_tg_menu.py` for the Telegram `/` command menu, which lives on
  Telegram's servers and is therefore untouched by any file patch. It replaces
  the stale Chinese menu left behind by `dsh-telegram-control` (no longer
  installed) with the commands `telegram-duty` really routes to.
* ✅ RTL layout pass lives in the sibling plugin **`dsh-rtl`** (text direction
  row, mirrored panels, 12 on-disk direction fixes; code, terminal, diff, JSON
  and path panes stay LTR).

## License

MIT.
