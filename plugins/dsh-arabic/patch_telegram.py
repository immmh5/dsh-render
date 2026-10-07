#!/usr/bin/env python3
"""Arabicize the Telegram-facing add-ons in the profile node_modules.

Three add-ons ship bot-side strings that never reach the DSH locale service,
so the only way to translate them is a source patch:

  @luzhengyangtx/dsh-telegram-duty  duty bot tables (zh|en -> +ar) and the
                                    config schema that selects the table
  dsh-telegram-channel              hard-coded MSG/status/label/history strings
  @goodandready/dsh-cron            Telegram task report + inline keyboard

Like patch_addons.py the patch is idempotent (marker), reversible (--revert
restores assets/backup/) and path-flexible (--profile).

Usage:
  python3 patch_telegram.py [--profile DIR] [--dry-run] [--check] [--revert]
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ROOT, "assets")
BACKUP = os.path.join(ASSETS, "backup")
MARKER = "dsh-arabic:telegram v2"
LEGACY_MARKERS = ("dsh-arabic:telegram v1",)

DUTY_DIR = "@luzhengyangtx/dsh-telegram-duty/lib"
CHANNEL_DIR = "dsh-telegram-channel/lib"
CRON_DIR = "@goodandready/dsh-cron/lib"

# Quote styles used by the literal each key is found under; escaping only
# matters for the quote that actually wraps the value.
QUOTE_ORDER = ("'", '"', "`")


def default_profile() -> str:
    return os.path.expanduser("~/.dsh/profiles/web")


def load_tduty_ar() -> str:
    path = os.path.join(ASSETS, "tduty-ar.js")
    with open(path, encoding="utf-8") as fh:
        body = fh.read().strip("\n")
    if not body.startswith("const ar = {"):
        raise SystemExit("assets/tduty-ar.js does not start with `const ar = {`")
    if not body.rstrip().endswith("}"):
        raise SystemExit("assets/tduty-ar.js does not end with `}`")
    return body


def load_channel_ar() -> dict[str, str]:
    path = os.path.join(ASSETS, "tgchannel-ar.json")
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or not data:
        raise SystemExit("assets/tgchannel-ar.json is not a non-empty object")
    return data


def esc(value: str, quote: str) -> str:
    """Escape `value` so it can sit between `quote` characters in JS source."""
    out = value.replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")
    if quote in ("'", '"'):
        out = out.replace(quote, "\\" + quote)
    else:
        out = out.replace("`", "\\`")
    return out


DUTY_COMMENT = "/** Resolve the message table for one language. */"


def _duty_ar_block() -> str:
    return load_tduty_ar() + "\n\n" + DUTY_COMMENT


# Left-overs that are not part of the zh/en tables: the approval-word regexes
# the bot parses the phone reply with, and one tool line in the approval digest.
# Both live in lib/types/*.js and are bundled into lib/index.js, so one op
# covers whichever copy a given file carries.
DUTY_RUNTIME_OPS: list[tuple[str, str, str]] = [
    (
        "first",
        "const ALLOW_WORDS = /^(同意|允许|批准|好|可以|行|ok|yes|approve|allow)$/i;",
        "const ALLOW_WORDS = /^(同意|允许|批准|好|可以|行|ok|yes|approve|allow|"
        "موافق|موافقة|نعم|تمام|accept)$/i;",
    ),
    (
        "first",
        "const REJECT_WORDS = /^(拒绝|不同意|取消|不要|不行|no|reject|deny)$/i;",
        "const REJECT_WORDS = /^(拒绝|不同意|取消|不要|不行|no|reject|deny|"
        "رفض|مرفوض|غير موافق|decline)$/i;",
    ),
    (
        "first",
        "lines.push(`· 工具「${item.toolName}」（${title}）`);",
        "lines.push(`· أداة: ${item.toolName} (${title})`);",
    ),
]


def duty_ops(relpath: str, text: str) -> list[tuple[str, str, str]]:
    """Anchors that belong to a given telegram-duty file.

    Every op here is anchor-based: once applied the anchor disappears, so a
    second run finds nothing to do. The one exception is the comment the `ar`
    table is inserted in front of — it stays in the file, so it is only offered
    while the table has not been inserted yet.
    """
    if relpath.endswith("types/config.js"):
        return [
            (
                "first",
                "language: z.union([z.const('zh'), z.const('en')]).default('en'),",
                "language: z.union([z.const('zh'), z.const('en'), z.const('ar')]).default('en'),",
            )
        ]
    ops: list[tuple[str, str, str]] = []
    if "const ar = {" not in text:
        ops.append(("first", DUTY_COMMENT, _duty_ar_block()))
    if relpath.endswith("types/i18n.js"):
        ops.append(
            (
                "first",
                "return language === 'zh' ? zh : en;",
                "return language === 'zh' ? zh : language === 'ar' ? ar : en;",
            )
        )
    else:
        ops.extend(
            [
                (
                    "first",
                    'return language === "zh" ? zh : en;',
                    'return language === "zh" ? zh : language === "ar" ? ar : en;',
                ),
                (
                    "first",
                    'language: z.union([z.const("zh"), z.const("en")]).default("en"),',
                    'language: z.union([z.const("zh"), z.const("en"), z.const("ar")]).default("en"),',
                ),
            ]
        )
    return ops + DUTY_RUNTIME_OPS


def channel_ops(text: str) -> list[tuple[str, str, str]]:
    mapping = load_channel_ar()
    # Longest key first so a short literal can never eat into a longer one.
    items = sorted(mapping.items(), key=lambda kv: len(kv[0]), reverse=True)
    ops: list[tuple[str, str, str]] = []
    for zh, ar in items:
        for quote in QUOTE_ORDER:
            old = quote + zh + quote
            if old in text:
                ops.append(("all", old, quote + esc(ar, quote) + quote))
                break
    return ops


CRON_TELEGRAM_OPS: list[tuple[str, str, str]] = [
    (
        "first",
        "{ text: '▶️ Run Now', callback_data: `cron:run:${taskId}` },",
        "{ text: '▶️ تشغيل الآن', callback_data: `cron:run:${taskId}` },",
    ),
    (
        "first",
        "{ text: isPaused ? '▶️ Resume' : '⏸ Pause', callback_data: `cron:pause:${taskId}` },",
        "{ text: isPaused ? '▶️ استئناف' : '⏸ إيقاف مؤقت', callback_data: `cron:pause:${taskId}` },",
    ),
    (
        "first",
        "{ text: '📄 Last Output', callback_data: `cron:log:${taskId}` },",
        "{ text: '📄 آخر مخرجات', callback_data: `cron:log:${taskId}` },",
    ),
    (
        "first",
        "const statusText = isSuccess ? 'Success' : 'Failed';",
        "const statusText = isSuccess ? 'نجاح' : 'فشل';",
    ),
    (
        "first",
        "const title = escapeMarkdown(task.title || 'Task');",
        "const title = escapeMarkdown(task.title || 'مهمة');",
    ),
    (
        "first",
        "`*Status:* ${statusEmoji} ${statusText}`",
        "`*الحالة:* ${statusEmoji} ${statusText}`",
    ),
    (
        "first",
        "`*Schedule:* ${schedule}`",
        "`*الجدول:* ${schedule}`",
    ),
    (
        "first",
        "`*Duration:* ${duration}`",
        "`*المدة:* ${duration}`",
    ),
    (
        "first",
        "lines.push('', '*Error:*', '```', errText, '```');",
        "lines.push('', '*الخطأ:*', '```', errText, '```');",
    ),
    (
        "first",
        "lines.push('', '*Output:*', '```', outText, '```');",
        "lines.push('', '*المخرجات:*', '```', outText, '```');",
    ),
    (
        "first",
        "`🔔 *dsh-cron test notification*\\n\\nConnection between DSH Cron and Telegram is working! Checked at: \\`${new Date().toISOString()}\\``",
        "`🔔 *dsh-cron — إشعار اختبار*\\n\\nالاتصال بين DSH Cron وTelegram يعمل! وقت الفحص: \\`${new Date().toISOString()}\\``",
    ),
    (
        "first",
        "message: 'Test message sent successfully'",
        "message: 'تم إرسال رسالة الاختبار بنجاح'",
    ),
]


def ops_for(relpath: str, text: str) -> list[tuple[str, str, str]]:
    """Return the anchors that actually exist in `text` for this file."""
    if relpath.startswith(DUTY_DIR):
        candidates = duty_ops(relpath, text)
    elif relpath.startswith(CHANNEL_DIR):
        candidates = channel_ops(text)
    elif relpath.startswith(CRON_DIR):
        candidates = CRON_TELEGRAM_OPS
    else:
        candidates = []
    return [(mode, old, new) for mode, old, new in candidates if old in text]


TARGETS = sorted(
    [
        DUTY_DIR + "/types/i18n.js",
        DUTY_DIR + "/types/config.js",
        DUTY_DIR + "/types/gateway.js",
        DUTY_DIR + "/types/approval.js",
        DUTY_DIR + "/index.js",
        CHANNEL_DIR + "/commands.js",
        CHANNEL_DIR + "/bridge.js",
        CHANNEL_DIR + "/status.js",
        CHANNEL_DIR + "/label.js",
        CHANNEL_DIR + "/history.js",
        CRON_DIR + "/telegram.js",
        CRON_DIR + "/routes.js",
    ]
)


def backup_path(relpath: str) -> str:
    return os.path.join(BACKUP, relpath.replace("/", "__") + ".orig")


def apply(src: str, relpath: str, dry_run: bool, revert: bool) -> tuple[str, str]:
    if not os.path.exists(src):
        return "missing", "target not found (add-on not installed)"
    with open(src, encoding="utf-8") as fh:
        text = fh.read()

    if revert:
        bak = backup_path(relpath)
        if not os.path.exists(bak):
            return "missing", "no backup to revert to"
        with open(bak, encoding="utf-8") as fh:
            pristine = fh.read()
        if text == pristine:
            return "already", "already pristine"
        if dry_run:
            return "ok", "would restore %s" % os.path.basename(bak)
        shutil.copyfile(bak, src)
        return "ok", "restored from backup"

    # Idempotency is anchor-based: once every anchor has been rewritten there
    # is nothing left to do, so a stamped file with no matching anchor is
    # simply "already". A file stamped by an older run still gets the ops it
    # has not seen yet.
    ops = ops_for(relpath, text)
    if not ops:
        stamped = MARKER in text or any(m in text for m in LEGACY_MARKERS)
        if stamped:
            return "already", "marker present"
        return "fail", "no known anchors found in this file"

    patched = text
    for mode, old, new in ops:
        patched = patched.replace(old, new, 1) if mode == "first" else patched.replace(old, new)

    # Safety net: no user-visible Chinese may survive the patch. Comments are
    # exempt (developer-facing, never rendered) and telegram-duty keeps its own
    # legitimate `zh` dictionary.
    leftover = [ln for ln in patched.splitlines() if _has_cjk(ln)]
    if leftover and not relpath.startswith(DUTY_DIR):
        return "fail", "%d line(s) would keep CJK: %r" % (len(leftover), leftover[0].strip()[:60])

    # Normalise the stamp: drop every marker version we know about and write
    # the current one as the first line.
    for known in (MARKER,) + LEGACY_MARKERS:
        patched = patched.replace("// " + known + "\n", "")
    patched = "// " + MARKER + "\n" + patched

    if dry_run:
        return "ok", "%d replacement(s) would apply" % len(ops)

    os.makedirs(BACKUP, exist_ok=True)
    bak = backup_path(relpath)
    if not os.path.exists(bak):
        shutil.copyfile(src, bak)

    with open(src, "w", encoding="utf-8") as fh:
        fh.write(patched)
    return "ok", "%d replacement(s) applied" % len(ops)


def _has_cjk(line: str) -> bool:
    # .d.ts / comments are not patched; ignore nothing here — every target is
    # a runtime JS file, so any CJK left means an unhandled literal.
    stripped = line.strip()
    if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/*"):
        return False
    return any("一" <= ch <= "鿿" for ch in line)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default=default_profile())
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--revert", action="store_true")
    args = ap.parse_args()

    nm = os.path.join(args.profile, "node_modules")
    counts: dict[str, int] = {}
    failed = False
    for relpath in TARGETS:
        src = os.path.join(nm, relpath)
        status, detail = apply(
            src, relpath, dry_run=args.dry_run or args.check, revert=args.revert
        )
        counts[status] = counts.get(status, 0) + 1
        print("  %-46s %-8s %s" % (relpath, status, detail))
        if status == "fail":
            failed = True
    print(
        "telegram patches: "
        + ", ".join("%s=%d" % kv for kv in sorted(counts.items()))
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
