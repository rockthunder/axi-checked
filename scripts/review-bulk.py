#!/usr/bin/env python3
"""Bulk-log pending files of one package into review/log.tsv from a JSON rules file.

usage: python -I scripts/review-bulk.py <package> <rules.json>

rules.json: {"special": {"<path relative to packages/<pkg>/>": ["VERDICT", "note"]},
             "rules":   [["<regex on relative path>", "VERDICT", "note"], ...]}
First match wins: special, then rules in order. Files with no match are left pending.
Notes that start with SCAN-ONLY mean the file was pattern-scanned, not read line by line.
"""
import json, re, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
pkg, rules_file = sys.argv[1], sys.argv[2]
cfg = json.loads(Path(rules_file).read_text(encoding="utf-8"))
special = cfg.get("special", {})
rules = [(re.compile(r), v, n) for r, v, n in cfg.get("rules", [])]


def run(*a):
    return subprocess.run([sys.executable, "-I", "scripts/review-status.py", *a], cwd=root, capture_output=True, text=True)


pending = [l.split()[-1] for l in run("pending", pkg, "1000").stdout.splitlines() if l.startswith("tier")]
logged = left = 0
for full in pending:
    rel = full.split("/", 2)[2] if full.startswith("packages/") else full
    # strip the package dir (may be nested, e.g. packages/atlassian-axi/jira-axi/...)
    rel = full[len("packages/"):]
    if rel in special:
        v, n = special[rel]
    else:
        m = next(((v, n) for rx, v, n in rules if rx.search(rel)), None)
        if not m:
            left += 1
            print("unmatched:", full)
            continue
        v, n = m
    r = run("log", full, v, n)
    if r.returncode != 0:
        print("FAIL", full, r.stdout, r.stderr)
    else:
        logged += 1
print(f"logged {logged}, left pending {left}")
