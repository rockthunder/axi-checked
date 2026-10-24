#!/usr/bin/env bash
# Build and test every package on Linux inside a throw-away container.
# Usage (from repo root):  docker run --rm -v "$PWD":/src:ro node:22-bookworm bash /src/scripts/test-linux.sh [package-dir ...]
# The repo is mounted read-only; work happens on a copy so host node_modules (Windows/macOS) are never touched.
set -uo pipefail
mkdir -p /work && cd /work
tar -C /src --exclude=node_modules --exclude=.git --exclude=dist -cf - . | tar -xf -
npm install -g pnpm@12.14.0 >/dev/null 2>&1
pnpm install --ignore-scripts --frozen-lockfile 2>&1 | tail -3
# build in dependency order: the SDK first, then everything else
pnpm --filter axi-sdk-js run build 2>&1 | tail -2
pnpm -r --if-present --no-bail --workspace-concurrency=2 run build > /tmp/build.log 2>&1; echo "build exit=$?"
grep -E "ERR_PNPM|error TS|Failed|failed" /tmp/build.log | sed "s/\[[0-9;]*m//g" | sort -u | head -30
targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
  mapfile -t targets < <(pnpm -r exec pwd 2>/dev/null | sed 's#^/work/##' | grep -v '^$' | grep -v '^\.$')
fi
for d in "${targets[@]}"; do
  [ -f "/work/$d/package.json" ] || continue
  if ! grep -q '"test"' "/work/$d/package.json"; then echo "== $d: no test script"; continue; fi
  echo "== $d"
  (cd "/work/$d" && timeout 900 pnpm run test 2>&1 | grep -E "Tests |Test Files|^# (tests|pass|fail)|ℹ (tests|pass|fail)|✖|FAIL|× " | sed 's/\x1b\[[0-9;]*m//g' | sort -u | head -40)
done
