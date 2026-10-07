#!/usr/bin/env python3
"""Assemble lib/client.js for dsh-rtl.

Order of operations (install.sh calls this):

  1. gen_rtl.py  -> assets/rtl.css + assets/rtl-report.txt
  2. read locales/*.json into the dictionary literal
  3. inline assets/row.css, assets/driver.css and assets/rtl.css
  4. substitute them into lib/client.template.js -> lib/client.js
  5. structural validation (no JS runtime exists in the sandbox, so the
     checks are lexical: placeholders gone, wrapper intact, balanced
     delimiters outside strings/comments, exported surface present)

`--check` regenerates into memory and fails if lib/client.js is stale.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEMPLATE = ROOT / "lib" / "client.template.js"
OUTPUT = ROOT / "lib" / "client.js"
LOCALES = ROOT / "locales"
REQUIRED_LOCALES = ("en", "ar", "zh")
PLACEHOLDERS = ("DICT", "ROW_CSS", "DRIVER_CSS", "RTL_CSS")


def js_escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def load_dictionaries() -> dict:
    dicts = {}
    for locale in REQUIRED_LOCALES:
        path = LOCALES / f"{locale}.json"
        if not path.is_file():
            raise SystemExit(f"dsh-rtl: missing locale file {path}")
        dicts[locale] = json.loads(path.read_text(encoding="utf-8"))
    base = set(dicts["en"])
    for locale, payload in dicts.items():
        missing = base - set(payload)
        extra = set(payload) - base
        if missing or extra:
            raise SystemExit(
                f"dsh-rtl: locale {locale} key set differs from en "
                f"(missing={sorted(missing)} extra={sorted(extra)})"
            )
    return dicts


def assemble() -> str:
    import gen_rtl

    if gen_rtl.main() != 0:
        raise SystemExit("dsh-rtl: gen_rtl.py failed")

    template = TEMPLATE.read_text(encoding="utf-8")
    dictionaries = load_dictionaries()
    row_css = (ROOT / "assets" / "row.css").read_text(encoding="utf-8")
    driver_css = (ROOT / "assets" / "driver.css").read_text(encoding="utf-8")
    rtl_css = (ROOT / "assets" / "rtl.css").read_text(encoding="utf-8")

    replacements = {
        "__DICT__": json.dumps(dictionaries, ensure_ascii=False, indent=1),
        "__ROW_CSS__": js_escape(row_css),
        "__DRIVER_CSS__": js_escape(driver_css),
        "__RTL_CSS__": js_escape(rtl_css),
    }
    bundle = template
    for token, payload in replacements.items():
        marker = f"/*{token}*/"
        if marker not in bundle:
            raise SystemExit(f"dsh-rtl: placeholder {marker} missing from template")
        bundle = bundle.replace(marker, payload)
    return bundle


def scan_js(source: str) -> list[str]:
    """Lexical pass over the emitted bundle: brackets must balance."""
    problems = []
    stack = []
    pairs = {")": "(", "]": "[", "}": "{"}
    i, n = 0, len(source)
    line = 1
    while i < n:
        c = source[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        if c == "/" and i + 1 < n and source[i + 1] == "/":
            while i < n and source[i] != "\n":
                i += 1
            continue
        if c == "/" and i + 1 < n and source[i + 1] == "*":
            i += 2
            while i + 1 < n and not (source[i] == "*" and source[i + 1] == "/"):
                if source[i] == "\n":
                    line += 1
                i += 1
            i += 2
            continue
        if c in "\"'`":
            quote = c
            i += 1
            while i < n:
                if source[i] == "\\":
                    i += 2
                    continue
                if source[i] == quote:
                    i += 1
                    break
                if source[i] == "\n":
                    line += 1
                i += 1
            continue
        if c in "([{":
            stack.append((c, line))
        elif c in ")]}":
            if not stack:
                problems.append(f"line {line}: unmatched {c}")
            elif stack[-1][0] != pairs[c]:
                problems.append(f"line {line}: {c} closes {stack[-1][0]} from line {stack[-1][1]}")
                stack.pop()
            else:
                stack.pop()
        i += 1
    for opener, opened_at in stack:
        problems.append(f"line {opened_at}: unclosed {opener}")
    return problems


def validate(bundle: str) -> list[str]:
    problems = []
    for token in PLACEHOLDERS:
        if f"/*__{token}__*/" in bundle:
            problems.append(f"placeholder {token} still present")
    head = 'window.__ModuleLoader__.load({ id: "dsh-rtl", factory: (require) => {'
    if not bundle.startswith(head):
        problems.append("bundle does not start with the dsh-rtl module-loader wrapper")
    tail = "return module.exports; } });"
    if not bundle.rstrip().endswith(tail):
        problems.append("bundle does not end with the module-loader tail")
    for needle in ("exports.apply = apply;", "exports.inject = inject;",
                   "ctx.slots.inject(\"settings.general.item\"", "order: ROW_ORDER",
                   "root.setAttribute(\"dir\", dir)"):
        if needle not in bundle:
            problems.append(f"expected fragment missing: {needle}")
    if "\nimport " in bundle or "\nexport " in bundle:
        problems.append("bundle contains bare import/export statements")
    problems.extend(scan_js(bundle))
    return problems


def main(argv: list[str]) -> int:
    bundle = assemble()
    problems = validate(bundle)
    if problems:
        for problem in problems:
            print(f"dsh-rtl: {problem}", file=sys.stderr)
        return 1

    if "--check" in argv:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.is_file() else ""
        if current != bundle:
            print("dsh-rtl: lib/client.js is stale, run install.sh", file=sys.stderr)
            return 1
        print("dsh-rtl: lib/client.js is up to date")
        return 0

    OUTPUT.write_text(bundle, encoding="utf-8")
    print(
        f"dsh-rtl: wrote {OUTPUT.relative_to(ROOT)} "
        f"({len(bundle)} bytes, {len(bundle.splitlines())} lines)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
