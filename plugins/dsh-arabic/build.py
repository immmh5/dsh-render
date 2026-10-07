#!/usr/bin/env python3
"""Build lib/client.js from locales/ar.json (+ validate against locales/en.json)."""
import json, os, re, sys, glob, collections

ROOT = os.path.dirname(os.path.abspath(__file__))
LOCALES = os.path.join(ROOT, "locales")

PLACEHOLDER = re.compile(r"\{[A-Za-z0-9_]+\}")
FMT = re.compile(r"%[sdif]|\{[A-Za-z0-9_]+\}")


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh, object_pairs_hook=collections.OrderedDict)


def merge_parts():
    ar = collections.OrderedDict()
    for path in sorted(glob.glob(os.path.join(LOCALES, "ar-*.json"))):
        for ns, entries in load(path).items():
            if ns in ar:
                raise SystemExit("duplicate namespace %s in %s" % (ns, os.path.basename(path)))
            ar[ns] = entries
    return ar


def reorder(en, ar):
    """Return ar re-ordered to follow en's namespace and key order (canonical)."""
    out = collections.OrderedDict()
    for ns, entries in en.items():
        got = ar.get(ns)
        if got is None:
            continue
        ordered = collections.OrderedDict()
        for key in entries:
            if key in got:
                ordered[key] = got[key]
        for key in got:
            if key not in ordered:
                ordered[key] = got[key]
        out[ns] = ordered
    for ns, got in ar.items():
        if ns not in out:
            out[ns] = got
    return out


def check(en, ar):
    problems = []
    if set(en) != set(ar):
        problems.append("namespace set differs: en=%d ar=%d" % (len(en), len(ar)))
    for ns, entries in en.items():
        got = ar.get(ns)
        if got is None:
            problems.append("missing namespace: %s" % ns)
            continue
        for key, value in entries.items():
            if key not in got:
                problems.append("missing key: %s.%s" % (ns, key))
                continue
            out = got[key]
            if not isinstance(out, str):
                problems.append("not a string: %s.%s" % (ns, key))
                continue
            if not out.strip():
                problems.append("empty translation: %s.%s" % (ns, key))
            if set(PLACEHOLDER.findall(value)) != set(PLACEHOLDER.findall(out)):
                problems.append("placeholder mismatch: %s.%s en=%r ar=%r" % (ns, key, value, out))
        for key in got:
            if key not in entries:
                problems.append("extra key: %s.%s" % (ns, key))
    for ns in ar:
        if ns not in en:
            problems.append("extra namespace: %s" % ns)
    return problems


def scan_js(src):
    """Brace/paren balance + string integrity (no JS runtime available here)."""
    pairs = {")": "(", "]": "[", "}": "{"}
    stack, i, n, line, instr, esc = [], 0, len(src), 1, None, False
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == instr:
                instr = None
        else:
            if c in "\"'`":
                instr = c
            elif c == "/" and i + 1 < n and src[i + 1] == "/":
                while i < n and src[i] != "\n":
                    i += 1
                continue
            elif c == "/" and i + 1 < n and src[i + 1] == "*":
                i += 2
                while i + 1 < n and not (src[i] == "*" and src[i + 1] == "/"):
                    if src[i] == "\n":
                        line += 1
                    i += 1
                i += 2
                continue
            elif c in "([{":
                stack.append((c, line))
            elif c in ")]}":
                if not stack or stack[-1][0] != pairs[c]:
                    raise SystemExit("client.js unbalanced %r at line %d" % (c, line))
                stack.pop()
        i += 1
    if instr is not None:
        raise SystemExit("client.js unterminated %r string" % instr)
    if stack:
        raise SystemExit("client.js unclosed %r" % (stack[:5],))


def emit_client(ar):
    dicts = json.dumps(ar, ensure_ascii=False, indent=None, separators=(",", ":"))
    return (
        "window.__ModuleLoader__.load({ id: \"dsh-arabic\", factory: (require) => {\n"
        "\"use strict\";\n"
        "var module = { exports: {} }; var exports = module.exports;\n"
        "const inject = [\"locale\"];\n"
        "const LANG = { id: \"ar\", label: \"\\u0627\\u0644\\u0639\\u0631\\u0628\\u064a\\u0629\", fallback: \"en\" };\n"
        "const DICTS = " + dicts + ";\n"
        "function resolveLocale(ctx) {\n"
        "\tif (ctx && ctx.locale && typeof ctx.locale.register === \"function\") return ctx.locale;\n"
        "\ttry { const s = ctx.get && ctx.get(\"locale\"); if (s && typeof s.register === \"function\") return s; } catch (e) {}\n"
        "\treturn null;\n"
        "}\n"
        "function apply(ctx) {\n"
        "\tconst locale = resolveLocale(ctx);\n"
        "\tif (!locale) return;\n"
        "\ttry { if (typeof locale.addLanguage === \"function\") locale.addLanguage(LANG); } catch (e) {}\n"
        "\tfor (const ns of Object.keys(DICTS)) {\n"
        "\t\ttry { locale.register(ns, \"ar\", DICTS[ns]); } catch (e) {}\n"
        "\t}\n"
        "}\n"
        "exports.apply = apply;\n"
        "exports.inject = inject;\n"
        "return module.exports; } });\n"
    )


def main():
    en = load(os.path.join(LOCALES, "en.json"))
    ar = reorder(en, merge_parts())
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        problems = check(en, ar)
        client = os.path.join(ROOT, "lib", "client.js")
        if os.path.exists(client):
            try:
                scan_js(open(client, encoding="utf-8").read())
            except SystemExit as exc:
                problems.append(str(exc))
        print("namespaces=%d keys=%d" % (len(ar), sum(len(v) for v in ar.values())))
        for p in problems:
            print("PROBLEM", p)
        print("problems: %d" % len(problems))
        return 1 if problems else 0
    problems = check(en, ar)
    if problems:
        for p in problems:
            print("PROBLEM", p)
        return 1
    with open(os.path.join(LOCALES, "ar.json"), "w", encoding="utf-8") as fh:
        json.dump(ar, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    out = emit_client(ar)
    scan_js(out)
    if not out.startswith('window.__ModuleLoader__.load({ id: "dsh-arabic"'):
        raise SystemExit("client.js wrapper does not match the ModuleLoader contract")
    if not out.rstrip().endswith("return module.exports; } });"):
        raise SystemExit("client.js wrapper is not closed")
    with open(os.path.join(ROOT, "lib", "client.js"), "w", encoding="utf-8") as fh:
        fh.write(out)
    print("built lib/client.js (%d bytes) — %d namespaces, %d keys" % (
        len(out.encode("utf-8")), len(ar), sum(len(v) for v in ar.values())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
