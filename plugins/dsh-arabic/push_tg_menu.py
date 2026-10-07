#!/usr/bin/env python3
"""Install/inspect the Telegram bot command menu (setMyCommands) in Arabic.

The `/` menu shown by Telegram is persisted server-side by Bot API, so it
survives plugin uninstall. `dsh-telegram-control` (since removed) pushed a
Chinese menu; this script replaces it with the commands the running add-on
(`@luzhengyangtx/dsh-telegram-duty`) actually handles.

Marker: dsh-arabic:tgmenu v1
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
BACKUP = ASSETS / "backup"
PREV = BACKUP / "tgmenu-prev.json"

MARKER = "dsh-arabic:tgmenu v1"
DSH_HOME = Path.home() / ".dsh"
PROFILE_PATCH = DSH_HOME / "profiles" / "web" / "cordis.patch.yml"

# command -> Arabic description (only what the live bot routes to a handler)
AR_MENU: list[tuple[str, str]] = [
    ("help", "قائمة الأوامر والمساعدة"),
    ("sessions", "عرض الجلسات الحيّة والتنقّل بينها"),
    ("away", "تفعيل وضع الوردية (تصل الموافقات إلى هاتفك)"),
    ("back", "العودة إلى الوضع المحلي (الموافقات في الويب)"),
    ("duty", "العودة إلى المسار الافتراضي لجلسة الوردية"),
    ("unblock", "إلغاء الجولات العالقة بسبب موافقات ويب لم تُجب"),
]
MAX_DESC = 256


def load_token() -> str:
    text = PROFILE_PATCH.read_text(encoding="utf-8")
    m = re.search(r"- id: telegram-duty\n  config:\n    token: '([^']+)'", text)
    if m and m.group(1):
        return m.group(1)
    import os
    return os.environ.get("DSH_TELEGRAM_TOKEN", "")


def api(token: str, method: str, payload: dict | None = None) -> dict:
    # NOTE: Bot API silently accepts-but-ignores a JSON body here (an unparsed
    # `commands` becomes an empty menu), so every write goes form-encoded.
    url = f"https://api.telegram.org/bot{token}/{method}"
    body = urllib.parse.urlencode(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/x-www-form-urlencoded"} if body else {}
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.load(resp)
    if not data.get("ok"):
        raise RuntimeError(f"telegram api {method} failed: {data.get('description')}")
    return data["result"]


def menu_payload() -> list[dict]:
    out = []
    for cmd, desc in AR_MENU:
        if len(desc) > MAX_DESC:
            raise SystemExit(f"description too long for /{cmd}: {len(desc)} > {MAX_DESC}")
        out.append({"command": cmd, "description": desc})
    return out


def set_commands(token: str, commands: list[dict]) -> bool:
    """Form-encoded `commands` field (see api(): JSON bodies are ignored)."""
    return bool(api(token, "setMyCommands", {"commands": json.dumps(commands, ensure_ascii=False)}))


def has_cjk(s: str) -> bool:
    return any("一" <= ch <= "鿿" for ch in s)


def cmd_check(token: str) -> int:
    cur = api(token, "getMyCommands")
    want = menu_payload()
    want_s = json.dumps(want, ensure_ascii=False, sort_keys=True)
    cur_s = json.dumps(cur, ensure_ascii=False, sort_keys=True)
    cjk = [c for c in cur if has_cjk(c.get("description", ""))]
    print(f"current menu: {len(cur)} command(s), chinese descriptions: {len(cjk)}")
    for c in cur:
        flag = "CJK" if has_cjk(c.get("description", "")) else "ok "
        print(f"  [{flag}] /{c.get('command'):<10} {c.get('description')}")
    if cjk:
        print("=> chinese menu still live")
        return 1
    if cur_s != want_s:
        print("=> menu differs from the Arabic one (not chinese)")
        return 1
    print(f"==> arabic menu in place ({MARKER})")
    return 0


def cmd_push(token: str, dry_run: bool) -> int:
    want = menu_payload()
    current = api(token, "getMyCommands")
    if dry_run:
        print(f"would push {len(want)} command(s):")
        for item in want:
            print(f"  /{item['command']:<10} {item['description']}")
        return 0
    if not PREV.exists() and current:
        BACKUP.mkdir(parents=True, exist_ok=True)
        PREV.write_text(
            json.dumps({"menu": current}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"  saved previous menu -> {PREV.relative_to(HERE)}")
    set_commands(token, want)
    after = api(token, "getMyCommands")
    print(f"pushed {len(want)} command(s); server now has {len(after)}")
    return 0 if after == want else 1


def cmd_revert(token: str) -> int:
    if not PREV.exists():
        print("no saved previous menu (nothing to revert)", file=sys.stderr)
        return 1
    prev = json.loads(PREV.read_text(encoding="utf-8")).get("menu") or []
    set_commands(token, prev)
    print(f"restored {len(prev)} previous command(s)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Arabic Telegram bot command menu")
    ap.add_argument("--check", action="store_true", help="inspect only, exit 1 if not arabic")
    ap.add_argument("--dry-run", action="store_true", help="print the menu, do not call the api")
    ap.add_argument("--revert", action="store_true", help="restore the menu captured before the first push")
    ap.add_argument("--token", default=None, help="bot token (default: telegram-duty config)")
    args = ap.parse_args()

    token = args.token or load_token()
    if not token:
        print("no bot token found (telegram-duty config / DSH_TELEGRAM_TOKEN)", file=sys.stderr)
        return 2

    if args.check:
        return cmd_check(token)
    if args.revert:
        return cmd_revert(token)
    return cmd_push(token, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
