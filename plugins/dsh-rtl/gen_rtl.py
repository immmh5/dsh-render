#!/usr/bin/env python3
"""Generate the RTL override layer for dsh-rtl.

Scans every CSS surface the Harness web GUI can paint — the shipped frontend
bundles plus the CSS string literals inlined by each `dsh.client` package
(including third-party profile plugins) — mirrors the direction-sensitive
declarations, and writes:

  assets/rtl.css        the `html[dir="rtl"]` scoped override layer
  assets/rtl-report.txt every mirrored rule plus everything left alone

Invoked by build.py before the bundle is emitted.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_CSS = ROOT / "assets" / "rtl.css"
OUT_REPORT = ROOT / "assets" / "rtl-report.txt"

HARNESS_HOME = Path(os.environ.get("DSH_HOME", Path.home() / ".dsh"))
GLOBAL_DSH = Path.home() / ".npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules"
WEB = HARNESS_HOME / "profiles" / "web"
FRONTEND_DIST = GLOBAL_DSH / "@deepseek-ai" / "dsh-web-frontend" / "dist" / "assets"

SCOPE = 'html[dir="rtl"]'

ISLAND_SUFFIXES = (
    "codeBody", "terminalBody", "diffBody", "jsonPayload", "jsonPreview",
    "promptDiff", "sourceBlockContent", "resultBlockText", "jsonRow",
    "jsonKey", "jsonValue",
)
ISLAND_STATIC = (".md-code-block", "[data-files-path]")

# (rtl side, ltr side, value used to neutralise whichever side stops carrying it)
SWAP_PAIRS = (
    ("right", "left", "auto"),
    ("margin-right", "margin-left", "0"),
    ("padding-right", "padding-left", "0"),
    ("border-right", "border-left", "none"),
    ("border-right-width", "border-left-width", "0"),
    ("border-right-style", "border-left-style", "none"),
    ("border-right-color", "border-left-color", "currentColor"),
    ("border-top-right-radius", "border-top-left-radius", "0"),
    ("border-bottom-right-radius", "border-bottom-left-radius", "0"),
)

VALUE_SIDE_PROPS = {"text-align", "float", "vertical-align", "background-position",
                    "background-position-x", "transition", "transition-property"}

SHORTHAND_MARGIN = ("margin-top", "margin-right", "margin-bottom", "margin-left")
SHORTHAND_PADDING = ("padding-top", "padding-right", "padding-bottom", "padding-left")
SHORTHAND_INSET = ("top", "right", "bottom", "left")

AT_BLOCK = re.compile(r"^@(media|supports|keyframes|layer|container|scope|document|starting-style)\b")
AT_SKIP = re.compile(r"^@(font-face|page|import|charset|property)\b", re.I)
SIDE_WORDS = re.compile(r"(?<![A-Za-z0-9_-])(left|right)(?![A-Za-z0-9_-])")

# Physical offsets the Harness writes from JavaScript as *inline* styles.
# A stylesheet can only beat an inline style with !important, which is exactly
# what must not happen here: the JS already knows where the box belongs, so
# these declarations stay important-free and let inline win.
INLINE_OFFSET_PROPS = {"left", "right", "top", "bottom"}

# Selectors whose mirrored form must not be emitted at all. The Harness
# positions these portals from JavaScript (inline left/top); mirroring the
# class would either fight the inline style or over-constrain the box.
SKIP_SELECTORS = {
    "_toast_e5v0f_6": "portal positioned from js (inline left); mirroring over-constrains it",
}

# Selectors that only apply outside JS-positioned portals. The menu list is
# absolute in-flow (start edge) but becomes a fixed portal that JS places, so
# the mirrored start-edge rule is scoped away from that mode. The align-end
# modifier rides along for the same reason: without the qualifier it would
# lose the specificity battle against the scoped list rule above it.
PORTAL_SCOPE = {
    "_list_1nxmc_8": "._portal_1nxmc_44",
    "_alignEnd_1nxmc_57": "._portal_1nxmc_44",
}

ARABIC_FONT_STACK = (
    '"Noto Sans Arabic", "Noto Kufi Arabic", "Geeza Pro", "Segoe UI", Tahoma, '
    '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif'
)


# --------------------------------------------------------------------------- #
# extraction
# --------------------------------------------------------------------------- #
def js_strings(text: str):
    n, i = len(text), 0
    while i < n:
        ch = text[i]
        if ch in "\"'`":
            quote, i, buf = ch, i + 1, []
            while i < n:
                c = text[i]
                if c == "\\" and i + 1 < n:
                    buf.append(c)
                    buf.append(text[i + 1])
                    i += 2
                    continue
                if c == quote:
                    i += 1
                    break
                buf.append(c)
                i += 1
            yield "".join(buf)
            continue
        i += 1


def looks_like_css(value: str) -> bool:
    if len(value) < 40 or "{" not in value or "}" not in value:
        return False
    if "url(data:" in value[:80]:
        return False
    return re.search(r"\{[^{}]*:[^{}]*\}", value) is not None


# Bundles inline their stylesheets as `const css$N = "..."`; anchoring the
# string scan on that assignment keeps regex literals elsewhere in the file
# from stealing quote parity.
CSS_ASSIGN = re.compile(r"(?<![A-Za-z0-9_$])(?:css[A-Za-z0-9_$]*\s*=\s*|textContent\s*=\s*|insertRule\(\s*)")


def read_string(text: str, i: int):
    if i >= len(text) or text[i] not in "\"'`":
        return None
    quote = text[i]
    i += 1
    buf = []
    while i < len(text):
        c = text[i]
        if c == "\\" and i + 1 < len(text):
            buf.append(c)
            buf.append(text[i + 1])
            i += 2
            continue
        if c == quote:
            return "".join(buf), i + 1
        buf.append(c)
        i += 1
    return None


def css_literals(text: str):
    out = []
    for match in CSS_ASSIGN.finditer(text):
        start = match.end()
        while start < len(text) and text[start] in " \t\r\n":
            start += 1
        parsed = read_string(text, start)
        if parsed is None:
            continue
        value = parsed[0]
        if looks_like_css(value):
            out.append(value)
    return out


# --------------------------------------------------------------------------- #
# parsing
# --------------------------------------------------------------------------- #
def strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def split_top(text: str, sep: str):
    out, depth, quote, buf = [], 0, None, []
    i = 0
    while i < len(text):
        c = text[i]
        if quote:
            buf.append(c)
            if c == "\\" and i + 1 < len(text):
                buf.append(text[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c in "\"'":
            quote = c
            buf.append(c)
        elif c in "([{":
            depth += 1
            buf.append(c)
        elif c in ")]}":
            depth -= 1
            buf.append(c)
        elif c == sep and depth == 0:
            out.append("".join(buf))
            buf = []
        else:
            buf.append(c)
        i += 1
    out.append("".join(buf))
    return out


def split_ws(text: str):
    out, depth, quote, buf = [], 0, None, []
    for c in text:
        if quote:
            buf.append(c)
            if c == quote:
                quote = None
            continue
        if c in "\"'":
            quote = c
            buf.append(c)
        elif c in "([{":
            depth += 1
            buf.append(c)
        elif c in ")]}":
            depth -= 1
            buf.append(c)
        elif c.isspace() and depth == 0:
            if buf:
                out.append("".join(buf))
                buf = []
        else:
            buf.append(c)
    if buf:
        out.append("".join(buf))
    return out


def parse_decls(body: str):
    decls = []
    for chunk in split_top(body, ";"):
        if ":" not in chunk:
            continue
        prop, _, value = chunk.partition(":")
        prop, value = prop.strip(), value.strip()
        if not prop or not value or prop.startswith("--"):
            continue
        important = False
        if value.endswith("!important"):
            important = True
            value = value[: -len("!important")].strip()
        decls.append((prop, value, important))
    return decls


def expand_four(value, names):
    tokens = split_ws(value)
    if not 1 <= len(tokens) <= 4:
        return None
    if len(tokens) == 1:
        tokens = tokens * 4
    elif len(tokens) == 2:
        tokens = [tokens[0], tokens[1], tokens[0], tokens[1]]
    elif len(tokens) == 3:
        tokens = [tokens[0], tokens[1], tokens[2], tokens[1]]
    return dict(zip(names, tokens))


STYLE_KEYWORDS = {"none", "hidden", "dotted", "dashed", "solid", "double",
                  "groove", "ridge", "inset", "outset"}
LENGTH_RE = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([a-z]+|%)?$")
COLOR_PREFIXES = ("#", "rgb(", "rgba(", "hsl(", "hsla(", "hwb(", "lab(", "lch(",
                  "oklab(", "oklch(", "color(")
COLOR_KEYWORDS = {"transparent", "currentcolor", "inherit", "initial", "unset",
                  "revert", "revert-layer", "black", "white", "red", "green",
                  "blue", "gray", "grey", "silver", "maroon", "orange", "yellow"}
AMBIGUOUS = ("var(", "calc(", "min(", "max(", "clamp(", "env(")


def _classify_border_token(token, have_width):
    low = token.lower()
    if low in STYLE_KEYWORDS:
        return "style"
    if token.startswith(COLOR_PREFIXES) or low in COLOR_KEYWORDS:
        return "color"
    if LENGTH_RE.match(token):
        return "width"
    if token.startswith(AMBIGUOUS):
        return "color" if have_width else "width"
    return "color" if have_width else "width"


def expand_border(value, prop):
    """Expand `border*` into `border-<side>-<width|style|color>` longhands.

    Returns None when the shorthand is ambiguous (a lone `var()`), in which
    case the caller keeps it whole so the side-shorthand pair can swap it.
    """
    tokens = split_ws(value)
    if not 1 <= len(tokens) <= 3:
        return None
    if len(tokens) == 1 and tokens[0].startswith(AMBIGUOUS):
        return None
    if len(tokens) == 1 and not tokens[0].lower() in STYLE_KEYWORDS and not LENGTH_RE.match(tokens[0]) and not tokens[0].startswith(COLOR_PREFIXES):
        return None
    picked = {"width": None, "style": None, "color": None}
    for token in tokens:
        kind = _classify_border_token(token, picked["width"] is not None)
        if picked[kind] is None:
            picked[kind] = token
        else:
            return None
    if all(v is None for v in picked.values()):
        return None
    sides = ["top", "right", "bottom", "left"] if prop == "border" else [prop.split("-", 1)[1]]
    out = {}
    for side in sides:
        if picked["width"] is not None:
            out[f"border-{side}-width"] = picked["width"]
        if picked["style"] is not None:
            out[f"border-{side}-style"] = picked["style"]
        if picked["color"] is not None:
            out[f"border-{side}-color"] = picked["color"]
    return out


def _fill(seq):
    if len(seq) == 1:
        return seq * 4
    if len(seq) == 2:
        return [seq[0], seq[1], seq[0], seq[1]]
    if len(seq) == 3:
        return [seq[0], seq[1], seq[2], seq[1]]
    return seq


def expand_radius(value):
    before, _, after = value.partition("/")
    after = after or before
    a, b = split_ws(before), split_ws(after)
    if not (1 <= len(a) <= 4) or not (1 <= len(b) <= 4):
        return None
    a, b = _fill(a), _fill(b)
    return {
        "border-top-left-radius": a[0],
        "border-top-right-radius": a[1],
        "border-bottom-right-radius": a[2],
        "border-bottom-left-radius": a[3],
    } if before == after else {
        "border-top-left-radius": f"{a[0]} {b[0]}",
        "border-top-right-radius": f"{a[1]} {b[1]}",
        "border-bottom-right-radius": f"{a[2]} {b[2]}",
        "border-bottom-left-radius": f"{a[3]} {b[3]}",
    }


def expand(decls):
    out = []
    for prop, value, important in decls:
        if prop == "margin":
            exp = expand_four(value, SHORTHAND_MARGIN)
        elif prop == "padding":
            exp = expand_four(value, SHORTHAND_PADDING)
        elif prop == "inset":
            exp = expand_four(value, SHORTHAND_INSET)
        elif prop == "border-radius":
            exp = expand_radius(value)
        elif prop in ("border", "border-top", "border-right", "border-bottom", "border-left"):
            exp = expand_border(value, prop)
        else:
            exp = None
        if exp is None:
            out.append((prop, value, important))
            continue
        out.extend((key, val, important) for key, val in exp.items())
    return out


def flip_side_words(value: str) -> str:
    return SIDE_WORDS.sub(lambda m: "right" if m.group(1) == "left" else "left", value)


def mirror_decls(decls):
    """Mirror one rule's declarations. Returns (decls, notes) or (None, notes)."""
    expanded = expand(decls)
    table = {prop: (value, important) for prop, value, important in expanded}
    notes = []
    result = dict(table)

    for rtl_name, ltr_name, initial in SWAP_PAIRS:
        has_ltr, has_rtl = ltr_name in table, rtl_name in table
        if not has_ltr and not has_rtl:
            continue
        if has_ltr and has_rtl:
            result[ltr_name], result[rtl_name] = table[rtl_name], table[ltr_name]
            notes.append((rtl_name, f"swap {ltr_name} <-> {rtl_name}"))
        elif has_ltr:
            result[ltr_name] = (initial, table[ltr_name][1])
            result[rtl_name] = table[ltr_name]
            notes.append((rtl_name, f"move {ltr_name} -> {rtl_name}, reset {ltr_name}"))
        else:
            result[rtl_name] = (initial, table[rtl_name][1])
            result[ltr_name] = table[rtl_name]
            notes.append((ltr_name, f"move {rtl_name} -> {ltr_name}, reset {rtl_name}"))

    for prop in list(result):
        if prop in VALUE_SIDE_PROPS:
            value, important = result[prop]
            mirrored = flip_side_words(value)
            if mirrored != value:
                result[prop] = (mirrored, important)
                notes.append((prop, f"value {prop}: {value} -> {mirrored}"))

    changed = {k: v for k, v in result.items() if table.get(k) != v}
    if not changed:
        return None, [text for _, text in notes]

    order, seen, ordered = [p for p, _, _ in expanded], set(), []
    for prop in order + list(changed):
        if prop in changed and prop not in seen:
            seen.add(prop)
            ordered.append(prop)
    effective = [text for key, text in notes if key in changed]
    return [(prop, *changed[prop]) for prop in ordered], effective


def fmt_decls(decls, force_important=False):
    out = []
    for prop, value, important in decls:
        use = important or (force_important and prop not in INLINE_OFFSET_PROPS)
        out.append(f"{prop}: {value}{' !important' if use else ''}")
    return "; ".join(out)


def split_top_level(text: str, sep=","):
    """Split on `sep` only where it sits outside (), [] and quotes."""
    parts, depth, quote, start = [], 0, "", 0
    for i, ch in enumerate(text):
        if quote:
            if ch == quote:
                quote = ""
            continue
        if ch in "\"'":
            quote = ch
        elif ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif ch == sep and depth == 0:
            parts.append(text[start:i])
            start = i + 1
    parts.append(text[start:])
    return [p.strip() for p in parts if p.strip()]


def _scope_one(s: str) -> str:
    if ":root" in s:
        s = s.replace(":root", SCOPE)
        return s if s.startswith(SCOPE) else f"{SCOPE} {s}"
    if s == "html":
        return SCOPE
    if s.startswith("html") and not s.startswith("html-"):
        return SCOPE + s[4:]
    return f"{SCOPE} {s}"


def scope_selector(selector: str) -> str:
    s = " ".join(selector.split())
    if not s:
        return ""
    out = []
    for part in split_top_level(s):
        scoped = _scope_one(part)
        for key, excl in PORTAL_SCOPE.items():
            if key in part:
                scoped += f":not({excl})"
                break
        out.append(scoped)
    return ", ".join(out)


def walk_rules(css: str, wrapper="", keyframes=False):
    """Yield (at_wrapper, selector, body, in_keyframes) for every leaf rule."""
    i, n, sel_start = 0, len(css), 0
    while i < n:
        if css[i] == "{":
            selector = css[sel_start:i].strip()
            depth, j = 1, i + 1
            while j < n and depth:
                if css[j] == "{":
                    depth += 1
                elif css[j] == "}":
                    depth -= 1
                j += 1
            body = css[i + 1 : j - 1]
            if selector.startswith("@"):
                if AT_SKIP.match(selector):
                    pass
                elif AT_BLOCK.match(selector):
                    nested_keyframes = keyframes or selector.startswith("@keyframes")
                    yield from walk_rules(body, f"{wrapper}{selector}{{\n", nested_keyframes)
            else:
                yield (wrapper, selector, body, keyframes)
            i, sel_start = j, j
            continue
        i += 1


# --------------------------------------------------------------------------- #
# sources
# --------------------------------------------------------------------------- #
def _client_target(exports_field) -> str | None:
    if not isinstance(exports_field, dict):
        return None
    client = exports_field.get("./client")
    if isinstance(client, str):
        return client
    if isinstance(client, dict):
        for key in ("default", "import", "require"):
            if isinstance(client.get(key), str):
                return client[key]
    return None


def _scan_pkg(pkg_json: Path, found: dict):
    try:
        data = json.loads(pkg_json.read_text(encoding="utf-8"))
    except Exception:
        return
    declaration = data.get("dsh")
    if not isinstance(declaration, dict) or not isinstance(declaration.get("client"), dict):
        return
    target = _client_target(data.get("exports"))
    if target is None:
        return
    bundle = (pkg_json.parent / target).resolve()
    if bundle in found or not bundle.is_file():
        return
    try:
        found[bundle] = bundle.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return


def client_bundles():
    roots = [GLOBAL_DSH, WEB / "node_modules", WEB / "node_modules" / ".pnpm"]
    found = {}
    for root in roots:
        if not root.exists():
            continue
        for pattern in ("*/package.json", "@*/*/package.json"):
            for pkg_json in root.glob(pattern):
                _scan_pkg(pkg_json, found)
    return found


def collect():
    sources = []
    if FRONTEND_DIST.exists():
        for css_file in sorted(FRONTEND_DIST.glob("*.css")):
            sources.append((f"frontend:{css_file.name}",
                            css_file.read_text(encoding="utf-8", errors="replace")))
    bundles = client_bundles()
    for bundle, text in sorted(bundles.items(), key=lambda kv: str(kv[0])):
        label = f"bundle:{bundle.parent.parent.name}"
        literals = css_literals(text)
        if literals:
            sources.extend((label, literal) for literal in literals)
        else:
            sources.append((label, ""))
    return sources, bundles


# --------------------------------------------------------------------------- #
# render
# --------------------------------------------------------------------------- #
def render(sources):
    mirrored, report, skipped, islands = [], [], [], set()
    seen = set()

    for label, css in sources:
        if not css.strip():
            skipped.append((label, "-", "package ships no inlined css"))
            continue
        css = strip_comments(css)
        for match in re.finditer(r"\.([A-Za-z0-9_-]*(?:%s))\b" % "|".join(ISLAND_SUFFIXES), css):
            islands.add("." + match.group(1))
        for wrapper, selector, body, in_keyframes in walk_rules(css):
            if AT_SKIP.match(selector):
                continue
            decls = parse_decls(body)
            if not decls:
                continue
            if any(prop == "direction" or prop.startswith("dir-") for prop, _, _ in decls):
                skipped.append((label, selector, "already direction aware"))
                continue
            mirrored_decls, notes = mirror_decls(decls)
            if mirrored_decls is None:
                continue
            skip_reason = None
            for key, reason in SKIP_SELECTORS.items():
                if key in selector:
                    skip_reason = reason
                    break
            if skip_reason is not None:
                skipped.append((label, selector, skip_reason))
                continue
            close = "}\n" * wrapper.count("{")
            scope = selector if in_keyframes else scope_selector(selector)
            rendered = fmt_decls(mirrored_decls, force_important=True)
            block = f"{wrapper}{scope} {{ {rendered} }}"
            if close:
                block = f"{block}\n{close.rstrip(chr(10))}"
            if block in seen:
                continue
            seen.add(block)
            mirrored.append(block)
            report.append(
                f"{label}\n  {selector}\n  {scope} {{ {rendered} }}\n"
                f"  notes: {'; '.join(notes)}\n"
            )
    return mirrored, report, skipped, sorted(islands)


def main() -> int:
    sources, bundles = collect()
    rules, report, skipped, islands = render(sources)

    lines = [
        "/* dsh-rtl: generated RTL override layer -- do not edit; run install.sh */",
        f"/* scanned {len(sources)} css blobs from dsh-web-frontend and "
        f"{len(bundles)} dsh.client packages */",
        "",
        "/* ---- LTR islands: code, terminals, diffs, JSON, file paths ---- */",
    ]
    for selector in ISLAND_STATIC + tuple(islands):
        lines.append(f'{SCOPE} {selector} {{ direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }}')
    lines += [
        "",
        "/* ---- Arabic interface fonts ---- */",
        f'{SCOPE} {{',
        f"\t--dsw-font-family: {ARABIC_FONT_STACK} !important;",
        f"\t--ds-font-family: {ARABIC_FONT_STACK} !important;",
        "}",
        "",
        "/* ---- mirrored declarations ---- */",
    ]
    lines.extend(rules)
    OUT_CSS.write_text("\n".join(lines) + "\n", encoding="utf-8")

    head = [
        "dsh-rtl mirror report",
        f"css blobs scanned  : {len(sources)}",
        f"dsh.client packages: {len(bundles)}",
        f"rules mirrored     : {len(rules)}",
        f"ltr island classes : {len(islands)}",
        f"skipped            : {len(skipped)}",
        "",
        "MIRRORED",
        "========",
        "",
    ]
    tail = ["", "SKIPPED", "=======", ""]
    tail += [f"{label} :: {selector} :: {reason}" for label, selector, reason in skipped]
    OUT_REPORT.write_text("\n".join(head + report + tail) + "\n", encoding="utf-8")

    print(f"dsh-rtl: {len(rules)} mirrored rules, {len(islands)} island classes, "
          f"{len(bundles)} packages -> {OUT_CSS.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
