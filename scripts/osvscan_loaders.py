import json, re

def load_npm(path):
    d = json.load(open(path, encoding="utf-8"))
    prod, allp = set(), set()
    for k, v in d.get("packages", {}).items():
        if not k or "node_modules/" not in k or v.get("link"): continue
        name = k.split("node_modules/")[-1]
        ver = v.get("version")
        if not ver: continue
        allp.add((name, ver))
        if not v.get("dev"): prod.add((name, ver))
    return prod, allp

def load_bun(path):
    t = open(path, encoding="utf-8").read()
    t = re.sub(r",(\s*[}\]])", r"\1", t)
    d = json.loads(t)
    pk = d.get("packages", {})
    meta, byname = {}, {}
    for key, arr in pk.items():
        if not isinstance(arr, list) or not arr: continue
        ident = arr[0]
        i = ident.rfind("@")
        n, v = ident[:i], ident[i+1:]
        if v.startswith(("workspace:", "github:", "file:", "link:")) or "://" in v: continue
        deps = {}
        if len(arr) > 2 and isinstance(arr[2], dict):
            deps = {**(arr[2].get("dependencies") or {}), **(arr[2].get("optionalDependencies") or {})}
        meta[key] = (n, v, deps)
        byname.setdefault(n, []).append(key)
    roots = []
    for w in d.get("workspaces", {}).values():
        roots += list((w.get("dependencies") or {}).keys()) + list((w.get("optionalDependencies") or {}).keys())
    seen, stack = set(), list(roots)
    while stack:
        n = stack.pop()
        for key in byname.get(n, []):
            if key in seen: continue
            seen.add(key)
            stack.extend(meta[key][2].keys())
    prod = {(meta[k][0], meta[k][1]) for k in seen}
    allp = {(m[0], m[1]) for m in meta.values()}
    return prod, allp
