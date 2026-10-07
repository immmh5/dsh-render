#!/usr/bin/env python3
"""Apply the direction fixes dsh-rtl needs on disk.

The Harness ships its web bundles as generated JS, so a handful of places that
read physical coordinates have to be taught about `<html dir="rtl">`. Each fix
below is a guarded text substitution:

  * anchor present exactly once  -> apply (and snapshot the pristine file)
  * replacement already present -> already applied, nothing to do
  * neither                      -> the Harness moved; abort loudly rather
                                    than write a half-patched bundle

Snapshots land in assets/backup/ so `--revert` can restore them. Re-run this
(after build.py) whenever the Harness is updated.

  python3 patch_harness.py            apply
  python3 patch_harness.py --dry-run  report without writing
  python3 patch_harness.py --revert   restore the snapshots
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GLOBAL_DSH = Path.home() / ".npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai"
BACKUP = ROOT / "assets" / "backup"
STATE = ROOT / "assets" / "patches.applied.json"

HARNESS_SUFFIX = Path("@deepseek-ai") / "dsh" / "node_modules" / "@deepseek-ai"


def _looks_like_harness(path: Path) -> bool:
    return (path / "dsh-client-ui-layout").is_dir() and (path / "dsh-web-frontend").is_dir()


def resolve_harness(explicit: str | None = None) -> Path:
    """Locate <dsh>/node_modules/@deepseek-ai regardless of where dsh was installed."""
    import glob as _glob
    import os
    import shutil as _shutil
    import subprocess

    if explicit:
        path = Path(explicit).expanduser()
        if not _looks_like_harness(path):
            raise SystemExit(f"--harness: {path} is not a Harness node_modules tree")
        return path

    candidates: list[Path] = []
    if os.environ.get("DSH_HARNESS"):
        candidates.append(Path(os.environ["DSH_HARNESS"]).expanduser())

    dsh = _shutil.which("dsh") or _shutil.which("dsh-web")
    if dsh:
        real = Path(dsh).resolve()
        # <prefix>/bin/dsh -> <prefix>/lib/node_modules/@deepseek-ai/dsh/...
        candidates.append(real.parent.parent / "lib" / "node_modules" / HARNESS_SUFFIX)

    try:
        out = subprocess.run(
            ["npm", "root", "-g"], capture_output=True, text=True, timeout=15
        )
        if out.returncode == 0 and out.stdout.strip():
            candidates.append(Path(out.stdout.strip()) / HARNESS_SUFFIX)
    except Exception:
        pass

    candidates += [
        Path.home() / ".npm-global/lib/node_modules" / HARNESS_SUFFIX,
        Path("/usr/lib/node_modules") / HARNESS_SUFFIX,
        Path("/usr/local/lib/node_modules") / HARNESS_SUFFIX,
    ]

    for base in (Path.home(), Path("/usr/lib"), Path("/usr/local/lib"), Path("/opt")):
        candidates += [
            Path(p) / HARNESS_SUFFIX
            for p in _glob.glob(str(base / "*" / "lib/node_modules"))
        ]

    seen: set[str] = set()
    for path in candidates:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        if _looks_like_harness(path):
            return path

    raise SystemExit(
        "dsh-rtl: could not locate the Harness tree. "
        "Pass --harness <path-to>/node_modules/@deepseek-ai or set DSH_HARNESS."
    )


DIR_RTL = 'document.documentElement.dir === "rtl"'

PATCHES = [
    {
        "id": "layout.sidebar-drag",
        "package": "dsh-client-ui-layout",
        "why": "the sidebar handle must widen the sidebar when dragged left under RTL",
        "anchor": "actions.setSidebar(sidebarBase.current + dx);",
        "replace": (
            "actions.setSidebar(sidebarBase.current + ("
            + DIR_RTL
            + " ? -dx : dx));"
        ),
    },
    {
        "id": "layout.rightbar-drag",
        "package": "dsh-client-ui-layout",
        "why": "the right bar sits on the left edge under RTL, so its drag sign flips",
        "anchor": "actions.setRightbar(rightbarBase.current - dx);",
        "replace": (
            "actions.setRightbar(rightbarBase.current - ("
            + DIR_RTL
            + " ? -dx : dx));"
        ),
    },
    {
        "id": "attachment.rail-edges",
        "package": "dsh-client-ui-attachment",
        "why": "attachment rail edge detection reads scrollLeft from the start edge",
        "anchor": (
            "\t\t\t\tconst left = el.scrollLeft > 1;\n"
            "\t\t\t\tconst right = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;"
        ),
        "replace": (
            "\t\t\t\tconst railRtl = " + DIR_RTL + ";\n"
            "\t\t\t\tconst railPos = railRtl ? -el.scrollLeft : el.scrollLeft;\n"
            "\t\t\t\tconst railMax = el.scrollWidth - el.clientWidth;\n"
            "\t\t\t\tconst left = railPos > 1;\n"
            "\t\t\t\tconst right = railPos < railMax - 1;"
        ),
    },
    {
        "id": "attachment.rail-page",
        "package": "dsh-client-ui-attachment",
        "why": "the mirrored paging arrows keep their labels, so the scroll sign flips",
        "anchor": "\t\t\t\t\tleft: direction * Math.max(el.clientWidth - 64, 200),",
        "replace": (
            "\t\t\t\t\tleft: (" + DIR_RTL + " ? -direction : direction) "
            "* Math.max(el.clientWidth - 64, 200),"
        ),
    },
    {
        "id": "attachment.rail-grow",
        "package": "dsh-client-ui-attachment",
        "why": "new attachments land on the left edge under RTL",
        "anchor": "if (grew) el.scrollLeft = el.scrollWidth - el.clientWidth;",
        "replace": (
            "if (grew) el.scrollLeft = " + DIR_RTL
            + " ? -(el.scrollWidth - el.clientWidth) : el.scrollWidth - el.clientWidth;"
        ),
    },
    {
        "id": "directory-picker.crumbs",
        "package": "dsh-client-ui-directory-picker-browse",
        "why": "the breadcrumb trail scrolls to the newest crumb at the left under RTL",
        "anchor": "if (trail !== null) trail.scrollLeft = trail.scrollWidth;",
        "replace": (
            "if (trail !== null) trail.scrollLeft = " + DIR_RTL
            + " ? -(trail.scrollWidth - trail.clientWidth) : trail.scrollWidth;"
        ),
    },
    {
        "id": "directory-picker.miller",
        "package": "dsh-client-ui-directory-picker-browse",
        "why": "the Miller column scrolls to the selected row at the left under RTL",
        "anchor": (
            "if (row !== null && childPath !== void 0) row.scrollLeft = row.scrollWidth;"
        ),
        "replace": (
            "if (row !== null && childPath !== void 0) row.scrollLeft = " + DIR_RTL
            + " ? -(row.scrollWidth - row.clientWidth) : row.scrollWidth;"
        ),
    },
    # --- dsh-web-frontend: portalled menus and tooltips are placed from JS -----
    # These boxes are positioned with inline `left` from geometry measured at
    # open time, so the geometry itself has to understand `<html dir="rtl">`.
    {
        "id": "menu.portal-align",
        "package": "dsh-web-frontend",
        "path_glob": "dsh-web-frontend/dist/assets/index-*.js",
        "snapshot": "web-frontend-index.js",
        "why": "a menu's end edge is the left edge under RTL, and a right side opens leftwards",
        "anchor": (
            'let L,N;m==="right"?(L=Y.right+4,N=Y.top):p==="start"?(L=Y.left,'
            'N=m==="bottom"?Y.bottom+4:Y.top-K-4):(L=Y.right-se,'
            'N=m==="bottom"?Y.bottom+4:Y.top-K-4),'
        ),
        "replace": (
            'let L,N;const dshRtl=document.documentElement.dir==="rtl",'
            'dshEnd=dshRtl?p==="start":p==="end";'
            'm==="right"?(dshRtl?(L=Y.left-se-4,N=Y.top):(L=Y.right+4,N=Y.top))'
            ':dshEnd?(L=Y.right-se,N=m==="bottom"?Y.bottom+4:Y.top-K-4)'
            ':(L=Y.left,N=m==="bottom"?Y.bottom+4:Y.top-K-4),'
        ),
    },
    {
        "id": "tooltip.side",
        "package": "dsh-web-frontend",
        "path_glob": "dsh-web-frontend/dist/assets/index-*.js",
        "snapshot": "web-frontend-index.js",
        "why": "a right-hand tooltip sits off-screen under RTL, so it flips to the anchor's other side",
        "anchor": (
            'x(r),v({x:r==="right"?G.right+10:G.left+G.width/2,'
            "top:G.top,bottom:G.bottom})"
        ),
        "replace": (
            'const dshTipSide=document.documentElement.dir==="rtl"&&r==="right"'
            '? "left":r;x(dshTipSide),'
            'v({x:dshTipSide==="right"?G.right+10:'
            'dshTipSide==="left"?G.left-10:G.left+G.width/2,'
            "top:G.top,bottom:G.bottom})"
        ),
    },
    {
        "id": "tooltip.side-anchor",
        "package": "dsh-web-frontend",
        "path_glob": "dsh-web-frontend/dist/assets/index-*.js",
        "snapshot": "web-frontend-index.js",
        "why": "a flipped left-hand tooltip is vertically centred like its right-hand twin",
        "anchor": (
            'b=g===null?0:w==="right"?g.top+(g.bottom-g.top)/2:'
            'w==="top"?g.top-8:g.bottom+8'
        ),
        "replace": (
            'b=g===null?0:w==="right"||w==="left"?g.top+(g.bottom-g.top)/2:'
            'w==="top"?g.top-8:g.bottom+8'
        ),
    },
    {
        "id": "tooltip.side-place",
        "package": "dsh-web-frontend",
        "path_glob": "dsh-web-frontend/dist/assets/index-*.js",
        "snapshot": "web-frontend-index.js",
        "why": "a flipped tooltip hangs off the anchor's left edge and must not flip vertically",
        "anchor": (
            "G.style.left=`${g.x}px`;const P=G.getBoundingClientRect();let V=0;"
            "if(P.right>window.innerWidth-T&&(V=window.innerWidth-T-P.right),"
            "P.left+V<T&&(V=T-P.left),G.style.left=`${g.x+V}px`,r===\"right\")return;"
        ),
        "replace": (
            "G.style.left=`${g.x}px`;const P=G.getBoundingClientRect(),"
            'dshOff=w==="left"?P.width:0,dshBase=g.x-dshOff;let V=0;'
            "if(P.right-dshOff>window.innerWidth-T&&"
            "(V=window.innerWidth-T-(P.right-dshOff)),"
            "P.left-dshOff+V<T&&(V=T-(P.left-dshOff)),"
            "G.style.left=`${dshBase+V}px`,r===\"right\"||w===\"left\")return;"
        ),
    },
    {
        "id": "hovercard.side-place",
        "package": "dsh-web-frontend",
        "path_glob": "dsh-web-frontend/dist/assets/index-*.js",
        "snapshot": "web-frontend-index.js",
        "why": "a status card hangs off the anchor's right edge and would leave the screen under RTL",
        "anchor": (
            "const U=m.current?.offsetHeight??0;"
            "H.top+U>window.innerHeight-8&&$({left:H.left,top:window.innerHeight-U-8})"
        ),
        "replace": (
            "const U=m.current?.offsetHeight??0;"
            "const dshEr=document.documentElement.dir===\"rtl\"?"
            "p.current?.getBoundingClientRect():null,"
            "dshNl=dshEr?dshEr.left-(m.current?.offsetWidth??0)-8:H.left;"
            "if(dshNl!==H.left)return $({left:dshNl,top:H.top});"
            "H.top+U>window.innerHeight-8&&$({left:H.left,top:window.innerHeight-U-8})"
        ),
    },
]


def target(patch) -> Path | None:
    if "path" in patch:
        return GLOBAL_DSH / patch["path"]
    if "path_glob" in patch:
        matches = sorted(GLOBAL_DSH.glob(patch["path_glob"]))
        if len(matches) != 1:
            return None
        return matches[0]
    return GLOBAL_DSH / patch["package"] / "lib" / "client.js"


def snapshot_name(patch) -> str:
    return patch.get("snapshot", f"{patch['package']}-client.js")


def apply_patch(patch, dry_run: bool) -> str:
    path = target(patch)
    if path is None:
        return "AMBIGUOUS OR MISSING TARGET (path_glob matched nothing)"
    if not path.is_file():
        return f"MISSING FILE {path}"
    text = path.read_text(encoding="utf-8")
    if patch["replace"] in text:
        return "already"
    hits = text.count(patch["anchor"])
    if hits == 0:
        return "ANCHOR NOT FOUND (Harness changed this bundle)"
    if hits > 1:
        return f"ANCHOR AMBIGUOUS ({hits} matches)"
    if dry_run:
        return "would apply"
    BACKUP.mkdir(parents=True, exist_ok=True)
    snapshot = BACKUP / snapshot_name(patch)
    if not snapshot.exists():
        shutil.copy2(path, snapshot)
    path.write_text(text.replace(patch["anchor"], patch["replace"], 1), encoding="utf-8")
    return "applied"


def revert() -> int:
    if not BACKUP.is_dir():
        print("dsh-rtl: no snapshots to revert")
        return 0
    groups: dict[str, list[dict]] = {}
    for patch in PATCHES:
        groups.setdefault(snapshot_name(patch), []).append(patch)
    restored = 0
    for name in sorted(groups):
        snapshot = BACKUP / name
        patches = groups[name]
        path = target(patches[0])
        if not snapshot.is_file():
            continue
        if path is None or not path.is_file():
            print(f"dsh-rtl: skip {name}: target gone")
            continue
        current = path.read_text(encoding="utf-8")
        if not any(p["replace"] in current for p in patches):
            print(f"dsh-rtl: skip {name}: target is not patched")
            continue
        shutil.copy2(snapshot, path)
        print(f"dsh-rtl: reverted {name}")
        restored += 1
    print(f"dsh-rtl: restored {restored} bundle(s); restart dsh-web to reload")
    return 0


def main(argv: list[str]) -> int:
    global GLOBAL_DSH
    parser = argparse.ArgumentParser(description="Apply dsh-rtl on-disk direction fixes")
    parser.add_argument("--dry-run", action="store_true", help="report without writing")
    parser.add_argument("--revert", action="store_true", help="restore the pristine snapshots")
    parser.add_argument("--harness", default=None, help="path to <dsh>/node_modules/@deepseek-ai")
    args = parser.parse_args(argv)

    GLOBAL_DSH = resolve_harness(args.harness)
    print(f"dsh-rtl: harness tree {GLOBAL_DSH}")

    if args.revert:
        return revert()

    results = {}
    failures = []
    for patch in PATCHES:
        status = apply_patch(patch, args.dry_run)
        results[patch["id"]] = status
        marker = " " if status.startswith(("applied", "would", "already")) else "!"
        print(f"{marker} {patch['id']:<28} {status}")
        if marker == "!":
            failures.append(patch)

    if not args.dry_run:
        STATE.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if failures:
        print("\ndsh-rtl: the Harness bundles no longer match these anchors:", file=sys.stderr)
        for patch in failures:
            print(f"  - {patch['id']} ({patch['package']}): {patch['why']}", file=sys.stderr)
            print(f"    anchor: {patch['anchor'].strip()[:120]}", file=sys.stderr)
        print("  Re-check the sources and update gen_rtl.py/patch_harness.py, then re-run.",
              file=sys.stderr)
        return 1

    if args.dry_run:
        verb = "would be"
    elif all(status == "already" for status in results.values()):
        verb = "are already"
    else:
        verb = "are"
    print(f"\ndsh-rtl: all {len(PATCHES)} direction fixes {verb} in place")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
