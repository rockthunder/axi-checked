"""Full-read review tracker. Run from the repo root with:  python -I scripts/review-status.py <command>

  init                      (re)build review/manifest.tsv from tracked files, keeping review/log.tsv
  status                    progress per package (files and lines)
  pending [package] [N]     next N unread files (default 15), highest tier first
  log <path> <VERDICT> <note...>   record that <path> was read.  VERDICT: OK | NOTE | PATCHED | MANUAL
  manual                    list every MANUAL / NOTE entry
  render-manual             regenerate review/MANUAL-REVIEW.md from the log

Tiers (read order):  1 = entrypoints, network/process/credential/server code, SDK;  2 = other runtime source;
                     3 = build/dev scripts;  4 = vendored generated bundles;  5 = agent-facing markdown (SKILL/AGENTS/CLAUDE/playbooks)
Tests are not in the manifest (never shipped); see review/README.md.
"""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REV = os.path.join(ROOT, "review")
MAN, LOG = os.path.join(REV, "manifest.tsv"), os.path.join(REV, "log.tsv")
VERDICTS = ("OK", "NOTE", "PATCHED", "MANUAL")

CODE = re.compile(r"\.(ts|tsx|js|mjs|cjs|sh|py|ps1|bat|cmd)$")
# Excluded: tests/fixtures anywhere, and non-runtime top-level dirs of a package (docs, bench, demo, media, ...). Never exclude by name deeper than the package root.
TESTY = re.compile(r"(^|/)(test|tests|__tests__|fixtures?)(/|$)|\.(test|spec)\.|\.d\.ts$|^packages/[^/]+(/packages/[^/]+)?/(docs?|bench|benchmark|evals?|demo|examples?|media|assets)/")
AGENT_MD = re.compile(r"(^|/)(SKILL|AGENTS|CLAUDE|PLAYBOOK)\.md$|(^|/)(skills|playbooks|\.agents|\.claude)/.*\.md$", re.I)
HOT = re.compile(r"(fetch|http|net|child|spawn|exec|auth|token|cred|secret|oauth|server|proxy|bridge|client|hook|setup|config|install|update|export|share|socket|ws|keychain|keyring|login|env|process|shell|run|cli|main|bin)", re.I)


def git_files():
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, text=True).stdout
    return [f for f in out.split("\0") if f.startswith("packages/")]


def lines(p):
    try:
        with open(os.path.join(ROOT, p), "rb") as fh:
            return sum(1 for _ in fh)
    except OSError:
        return 0


def tier(p):
    if AGENT_MD.search(p):
        return 5
    if "/.agents/" in p and p.endswith(".mjs"):
        return 4
    if re.search(r"(^|/)scripts/", p):
        return 3
    base = os.path.basename(p)
    if "/bin/" in p or base in ("cli.ts", "cli.js", "main.ts", "index.ts", "index.js") or HOT.search(base) or "axi-sdk-js/src" in p:
        return 1
    return 2


def package_of(p):
    parts = p.split("/")
    # packages/<repo>[/packages/<inner>]/...
    if len(parts) > 3 and parts[2] == "packages":
        return f"{parts[1]}/{parts[3]}"
    return parts[1]


def build():
    os.makedirs(REV, exist_ok=True)
    rows = []
    for f in git_files():
        if TESTY.search(f) and not AGENT_MD.search(f):
            continue
        if AGENT_MD.search(f) or CODE.search(f):
            rows.append((package_of(f), f, lines(f), tier(f)))
    rows.sort(key=lambda r: (r[3], r[0], r[1]))
    with open(MAN, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("package\tpath\tlines\ttier\n")
        for r in rows:
            fh.write("\t".join(map(str, r)) + "\n")
    print(f"manifest: {len(rows)} files, {sum(r[2] for r in rows)} lines")


def read_manifest():
    with open(MAN, encoding="utf-8") as fh:
        next(fh)
        return [l.rstrip("\n").split("\t") for l in fh if l.strip()]


def read_log():
    d = {}
    if os.path.exists(LOG):
        with open(LOG, encoding="utf-8") as fh:
            for l in fh:
                p = l.rstrip("\n").split("\t", 3)
                if len(p) >= 3:
                    d[p[0]] = p
    return d


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "init":
        build(); return
    if cmd == "log":
        path, verdict, note = sys.argv[2], sys.argv[3].upper(), " ".join(sys.argv[4:]).replace("\t", " ").replace("\n", " ")
        if verdict not in VERDICTS:
            sys.exit(f"verdict must be one of {VERDICTS}")
        path = path.replace("\\", "/")
        if path not in {r[1] for r in read_manifest()}:
            sys.exit(f"not in manifest: {path}")
        os.makedirs(REV, exist_ok=True)
        with open(LOG, "a", encoding="utf-8", newline="\n") as fh:
            fh.write(f"{path}\t{verdict}\t{lines(path)}\t{note}\n")
        return
    man, log = read_manifest(), read_log()
    if cmd == "status":
        pk = {}
        for pkg, path, n, t in man:
            d = pk.setdefault(pkg, [0, 0, 0, 0])
            d[0] += 1; d[1] += int(n)
            if path in log:
                d[2] += 1; d[3] += int(n)
        tf = sum(d[0] for d in pk.values()); tr = sum(d[2] for d in pk.values())
        tl = sum(d[1] for d in pk.values()); trl = sum(d[3] for d in pk.values())
        print(f"{'package':45} {'files':>11} {'lines':>17}")
        for k, d in sorted(pk.items()):
            print(f"{k:45} {d[2]:>4}/{d[0]:<6} {d[3]:>7}/{d[1]:<9}{'  DONE' if d[2]==d[0] else ''}")
        print(f"{'TOTAL':45} {tr:>4}/{tf:<6} {trl:>7}/{tl:<9}")
        c = {}
        for e in log.values(): c[e[1]] = c.get(e[1], 0) + 1
        print("verdicts:", c)
    elif cmd == "pending":
        pkg = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].isdigit() else None
        n = int(sys.argv[-1]) if sys.argv[-1].isdigit() else 15
        todo = [r for r in man if r[1] not in log and (pkg is None or r[0] == pkg)]
        todo.sort(key=lambda r: (int(r[3]), r[0], r[1]))
        for r in todo[:n]: print(f"tier{r[3]} {r[2]:>6} {r[1]}")
        print(f"({len(todo)} pending{' in ' + pkg if pkg else ''})")
    elif cmd == "render-manual":
        out = ["# Items for a human to review", "",
               "Generated from `review/log.tsv` by `python -I scripts/review-status.py render-manual`. **MANUAL** = high risk or unsure: please look yourself. **NOTE** = minor, benign-but-worth-knowing.", ""]
        for want, title in (("MANUAL", "## MANUAL - needs your review"), ("NOTE", "## NOTE - minor observations")):
            ents = sorted((e for e in log.values() if e[1] == want), key=lambda e: e[0])
            out += [title, ""]
            if not ents: out += ["_(none)_", ""]
            for e in ents:
                out.append("- `" + e[0] + "`")
                out.append("  " + (e[3] if len(e) > 3 else ""))
            out.append("")
        with open(os.path.join(REV, "MANUAL-REVIEW.md"), "w", encoding="utf-8", newline=chr(10)) as fh:
            fh.write(chr(10).join(out))
        print("wrote review/MANUAL-REVIEW.md")
    elif cmd == "manual":
        for e in log.values():
            if e[1] in ("MANUAL", "NOTE"): print(f"{e[1]:6} {e[0]}  {e[3] if len(e) > 3 else ''}")
    else:
        sys.exit(__doc__)


main()
