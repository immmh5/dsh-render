#!/usr/bin/env python3
"""Arabicize third-party add-on client sources in the profile node_modules.

Why a source patch: some add-ons ship their own hard-coded i18n tables instead
of registering a namespace with the DSH locale service, so an `ar` dictionary
can only be added by editing the shipped client bundle. The patch is:

  * idempotent   — a marker comment is written on first application and every
                   later run reports "already" instead of applying twice,
  * reversible    — the pristine file is copied to assets/backup/ before the
                   first change and `--revert` restores it,
  * path-flexible — the profile directory can be overridden with --profile.

Usage:
  python3 patch_addons.py [--profile DIR] [--dry-run] [--check] [--revert]
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
MARKER = "dsh-arabic:addons v1"


def default_profile() -> str:
    return os.path.expanduser("~/.dsh/profiles/web")


def rel(path: str) -> str:
    return os.path.basename(os.path.dirname(path)) + "/" + os.path.basename(path)


def load_ar_block() -> str:
    path = os.path.join(ASSETS, "freesearch-ar.js")
    with open(path, encoding="utf-8") as fh:
        body = fh.read().strip("\n")
    if not body.startswith("        description:"):
        raise SystemExit("assets/freesearch-ar.js does not look like an I18N object body")
    return body


def free_search_ops() -> list[tuple[str, list[tuple[str, str]]]]:
    ar_body = load_ar_block()
    i18n_open = "    const I18N = {\n      zh: {"
    i18n_new = "    const I18N = {\n      // " + MARKER + "\n      ar: {\n" + ar_body + "\n      },\n      zh: {"
    return [
        (
            "i18n.ar-dict",
            [(i18n_open, i18n_new)],
        ),
        (
            "i18n.tt-fallback",
            [
                (
                    'const tt = (lang) => I18N[lang === "en" ? "en" : "zh"];',
                    "const tt = (lang) => I18N[lang] || I18N.en;",
                )
            ],
        ),
        (
            "lang.default",
            [
                (
                    'const [lang, setLang] = react.useState("zh");',
                    'const [lang, setLang] = react.useState('
                    '(() => { try { return (document.documentElement.lang || "").toLowerCase().startsWith("ar") ? "ar" : "zh"; } catch (e) { return "zh"; } })());',
                ),
                (
                    'setLang(v.lang === "en" ? "en" : "zh");',
                    'setLang((() => { try { if ((document.documentElement.lang || "").toLowerCase().startsWith("ar")) return "ar"; } catch (e) {} return v.lang === "en" ? "en" : "zh"; })());',
                ),
            ],
        ),
        (
            "lang.toggle-cycle",
            [
                (
                    "setLang((prev) => (prev === \"en\" ? \"zh\" : \"en\"));",
                    'setLang((prev) => (prev === "ar" ? "en" : prev === "en" ? "zh" : "ar"));',
                ),
                (
                    'toggleLang: "EN",\n        checkUpdate: "检查更新",',
                    'toggleLang: "ع",\n        checkUpdate: "检查更新",',
                ),
            ],
        ),
        (
            "cmd-and-menu",
            [
                (
                    'description: () => "切换搜索引擎 / Switch web search engine",',
                    'description: () => "تبديل محرك البحث / Switch web search engine",',
                ),
                (
                    'label: "SearXNG · 元搜索"',
                    'label: "SearXNG · متعدد المصادر"',
                ),
                (
                    '? " · 免费" : " · API Key"',
                    '? " · مجاني" : " · API Key"',
                ),
                (
                    'view?.value?.lang === "en" ? "current" : "当前"',
                    'view?.value?.lang === "en" ? "current" : "الحالي"',
                ),
            ],
        ),
        (
            "summary-text",
            [
                (
                    '      return primary.startsWith("en")\n'
                    '        ? "13 engines · time filtering · platform search · web_fetch"\n'
                    '        : "13 个搜索引擎 · 时间筛选 · 平台搜索 · web_fetch";',
                    '      let arabic = false;\n'
                    '      try { arabic = (document.documentElement.lang || "").toLowerCase().startsWith("ar"); } catch (e) {}\n'
                    '      if (arabic) return "13 محرك بحث · تصفية زمنية · بحث المنصات · web_fetch";\n'
                    '      return primary.startsWith("en")\n'
                    '        ? "13 engines · time filtering · platform search · web_fetch"\n'
                    '        : "13 个搜索引擎 · 时间筛选 · 平台搜索 · web_fetch";',
                ),
            ],
        ),
    ]


TARGETS = {
    "dsh-free-search/lib/client.js": free_search_ops,
}


def backup_path(relpath: str) -> str:
    return os.path.join(BACKUP, relpath.replace("/", "__") + ".orig")


def apply(src: str, relpath: str, ops, dry_run: bool, revert: bool) -> tuple[str, str]:
    if not os.path.exists(src):
        return "missing", "target not found (add-on not installed)"
    with open(src, encoding="utf-8") as fh:
        text = fh.read()

    if revert:
        bak = backup_path(relpath)
        if not os.path.exists(bak):
            return "missing", "no backup to revert to"
        if text == open(bak, encoding="utf-8").read():
            return "already", "already pristine"
        if dry_run:
            return "ok", "would restore %s" % os.path.basename(bak)
        shutil.copyfile(bak, src)
        return "ok", "restored from backup"

    if MARKER in text:
        return "already", "marker present"

    missing = []
    for label, pairs in ops:
        for old, new in pairs:
            if old not in text:
                missing.append(label)
    if missing:
        return "fail", "anchors not found: %s" % ", ".join(sorted(set(missing)))

    if dry_run:
        return "ok", "%d op group(s) would apply" % len(ops)

    os.makedirs(BACKUP, exist_ok=True)
    bak = backup_path(relpath)
    if not os.path.exists(bak):
        shutil.copyfile(src, bak)

    for _label, pairs in ops:
        for old, new in pairs:
            if old not in text:
                raise SystemExit("anchor disappeared mid-patch: %r" % old[:60])
            text = text.replace(old, new, 1)
    with open(src, "w", encoding="utf-8") as fh:
        fh.write(text)
    return "ok", "%d op group(s) applied" % len(ops)


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
    for relpath, ops_fn in sorted(TARGETS.items()):
        src = os.path.join(nm, relpath)
        ops = [] if args.revert else ops_fn()
        status, detail = apply(src, relpath, ops, args.dry_run or args.check, args.revert)
        counts[status] = counts.get(status, 0) + 1
        line = "  %-34s %-8s %s" % (relpath, status, detail)
        print(line)
        if status == "fail":
            failed = True
    print("add-on patches: " + ", ".join("%s=%d" % kv for kv in sorted(counts.items())))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
