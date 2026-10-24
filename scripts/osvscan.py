"""OSV scan of pnpm-lock.yaml (v9). Splits findings into RUNTIME (reachable from importers' dependencies) vs DEV-ONLY.
Usage: osvscan.py <lockfile>... ; --json emits machine-readable output."""
import json, re, sys, urllib.request, yaml

def split_key(k):
    k = k.strip("'\"")
    base = k.split("(")[0]
    i = base.rfind("@")
    return base[:i], base[i+1:], k

def load(path):
    d = yaml.safe_load(open(path, encoding="utf-8"))
    snaps = d.get("snapshots", {})
    # map "name@version" (no peer suffix) -> list of full snapshot keys
    by_nv = {}
    for k in snaps:
        n, v, full = split_key(k)
        by_nv.setdefault((n, v), []).append(k)
    def deps_of(key):
        s = snaps.get(key) or {}
        out = []
        for sect in ("dependencies", "optionalDependencies"):
            for n, ver in (s.get(sect) or {}).items():
                ver = str(ver)
                full = f"{n}@{ver}"
                out.append(full if full in snaps else None or full)
        return out
    def walk(roots):
        seen, stack = set(), list(roots)
        while stack:
            k = stack.pop()
            if k in seen:
                continue
            seen.add(k)
            stack.extend(deps_of(k))
        return seen
    prod_roots, all_roots = [], []
    for imp in d.get("importers", {}).values():
        for n, o in (imp.get("dependencies") or {}).items():
            prod_roots.append(f"{n}@{o['version']}")
        for sect in ("dependencies", "devDependencies", "optionalDependencies"):
            for n, o in (imp.get(sect) or {}).items():
                all_roots.append(f"{n}@{o['version']}")
    prod = walk(prod_roots)
    prod_nv = {split_key(k)[:2] for k in prod}
    all_nv = set(by_nv)
    return prod_nv, all_nv

import os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "osvscan_loaders.py")).read())

def load_any(p):
    if p.endswith("package-lock.json"): return load_npm(p)
    if p.endswith("bun.lock"): return load_bun(p)
    return load(p)

def osv(queries):
    out = []
    for i in range(0, len(queries), 500):
        body = json.dumps({"queries": queries[i:i+500]}).encode()
        req = urllib.request.Request("https://api.osv.dev/v1/querybatch", body, {"Content-Type": "application/json"})
        out += json.load(urllib.request.urlopen(req, timeout=60))["results"]
    return out

cache = {}
def detail(vid):
    if vid not in cache:
        cache[vid] = json.load(urllib.request.urlopen(f"https://api.osv.dev/v1/vulns/{vid}", timeout=60))
    return cache[vid]

def fixed(d, name):
    fx = set()
    for a in d.get("affected", []):
        if a.get("package", {}).get("name") == name:
            for r in a.get("ranges", []):
                for e in r.get("events", []):
                    if "fixed" in e:
                        fx.add(e["fixed"])
    return sorted(fx)

report = {}
for lock in [a for a in sys.argv[1:] if not a.startswith("--")]:
    prod, allp = load_any(lock)
    pk = sorted(allp)
    res = osv([{"package": {"name": n, "ecosystem": "npm"}, "version": v} for n, v in pk])
    rows = []
    for (n, v), r in zip(pk, res):
        for vu in r.get("vulns", []):
            d = detail(vu["id"])
            sev = (d.get("database_specific") or {}).get("severity", "?")
            rows.append({"id": vu["id"], "sev": sev, "pkg": f"{n}@{v}", "runtime": (n, v) in prod,
                         "fixed": fixed(d, n), "summary": d.get("summary", "")[:100],
                         "aliases": [a for a in d.get("aliases", []) if a.startswith("CVE")]})
    report[lock] = {"total": len(pk), "runtime_pkgs": len(prod), "vulns": rows}

if "--json" in sys.argv:
    print(json.dumps(report, indent=1))
else:
    for lock, r in report.items():
        print(f"## {lock}: {r['total']} pkgs, {r['runtime_pkgs']} runtime-reachable")
        for tag, want in (("RUNTIME", True), ("dev-only", False)):
            rows = [x for x in r["vulns"] if x["runtime"] == want]
            print(f" {tag}: {len(rows)}")
            for x in sorted(rows, key=lambda x: x["sev"]):
                print(f"  - {x['id']} [{x['sev']}] {x['pkg']} fixed>={','.join(x['fixed'])} {x['summary'][:70]}")
