import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "bin", "redis-axi.js");

// Hardening added in the corporate build (see SECURITY-REVIEW.md): read-only guard is an allowlist,
// passwords never reach redis-cli's command line, and no passwordless ACL users are created.

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "redis-axi-sec-"));
}

function fakeRedisCli(cwd, log) {
  const bin = path.join(cwd, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const file = path.join(bin, "redis-cli");
  fs.writeFileSync(
    file,
    `#!/bin/sh
printf 'ARGS=%s|AUTH=%s\\n' "$*" "$REDISCLI_AUTH" >> '${log}'
if [ ! -t 0 ]; then cat >> '${log}.stdin'; fi
echo OK
`,
  );
  fs.chmodSync(file, 0o755);
  return bin;
}

function run(args, { cwd, bin, env = {} }) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, ...env },
    encoding: "utf8",
  });
}

test("commands that are not known reads need --execute (allowlist, not denylist)", () => {
  const cwd = workspace();
  const log = path.join(cwd, "cli.log");
  const bin = fakeRedisCli(cwd, log);
  const dangerous = [
    `EVAL "return redis.call('flushall')" 0`,
    "EVALSHA abc 0",
    "FCALL myfunc 0",
    "FUNCTION FLUSH",
    "SCRIPT FLUSH",
    "SHUTDOWN NOSAVE",
    "PUBLISH chan msg",
    "MODULE LOAD /tmp/evil.so",
    "SETBIT k 1 1",
    "PFADD k a",
    "CLIENT KILL ID 1",
    "CLUSTER RESET HARD",
    "CONFIG SET dir /tmp",
    "ACL SETUSER x on nopass +@all",
    "SENTINEL FAILOVER mymaster",
    "BGREWRITEAOF",
    "SAVE",
    "MIGRATE host 6379 key 0 1000",
  ];
  for (const command of dangerous) {
    const result = run(["query", "--command", command], { cwd, bin });
    assert.equal(result.status, 0, command);
    assert.match(result.stdout, /dry_run: true/, `expected dry run for: ${command}`);
    assert.match(result.stdout, /read_only: false/, command);
  }
  assert.equal(fs.existsSync(log), false, "redis-cli must not be invoked for any of them");

  for (const command of ["GET k", "HGETALL h", "XINFO STREAM s", "CLIENT LIST", "ACL WHOAMI", "CONFIG GET maxmemory", "SCAN 0", "TTL k"]) {
    const result = run(["query", "--command", command], { cwd, bin });
    assert.match(result.stdout, /read_only: true/, `expected read-only for: ${command}`);
    assert.match(result.stdout, /dry_run: false/, command);
  }
});

test("a command file with RESP-framed or unknown lines needs --execute", () => {
  const cwd = workspace();
  const log = path.join(cwd, "cli.log");
  const bin = fakeRedisCli(cwd, log);
  fs.writeFileSync(path.join(cwd, "resp.txt"), "*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$1\r\nv\r\n");
  fs.writeFileSync(path.join(cwd, "eval.txt"), "GET a\nEVAL \"return 1\" 0\n");
  fs.writeFileSync(path.join(cwd, "reads.txt"), "GET a\nHGETALL h\n");
  for (const file of ["resp.txt", "eval.txt"]) {
    const result = run(["query", "--file", file], { cwd, bin });
    assert.match(result.stdout, /dry_run: true/, file);
  }
  const reads = run(["query", "--file", "reads.txt"], { cwd, bin });
  assert.match(reads.stdout, /dry_run: false/);
});

test("a password in the connection URL is passed via REDISCLI_AUTH, never on the command line", () => {
  const cwd = workspace();
  const log = path.join(cwd, "cli.log");
  const bin = fakeRedisCli(cwd, log);
  const result = run(["query", "--command", "GET k", "--url", "redis://app:s3cr%40t@cache.example.com:6379/0"], { cwd, bin });
  assert.equal(result.status, 0);
  const lines = fs.readFileSync(log, "utf8").split("\n").filter((line) => line.startsWith("ARGS="));
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.doesNotMatch(line.split("|AUTH=")[0], /s3cr/);
    assert.match(line, /cache\.example\.com/);
    assert.match(line, /\|AUTH=s3cr@t$/);
  }
});

test("creating an ACL user requires a password, is read-only by default, and the password goes via stdin", () => {
  const cwd = workspace();
  const log = path.join(cwd, "cli.log");
  const bin = fakeRedisCli(cwd, log);

  const noPassword = run(["create", "--kind", "user", "--name", "svc"], { cwd, bin });
  assert.notEqual(noPassword.status, 0);
  assert.match(noPassword.stdout, /requires a password/);
  assert.doesNotMatch(noPassword.stdout, /nopass/);

  const dry = run(["create", "--kind", "user", "--name", "svc", "--value", "hunter2hunter2"], { cwd, bin });
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /dry_run: true/);
  assert.doesNotMatch(dry.stdout, /hunter2/);
  assert.doesNotMatch(dry.stdout, /nopass|\+@all/);
  assert.match(dry.stdout, /\+@read/);

  const executed = run(["create", "--kind", "user", "--name", "svc", "--value", "hunter2hunter2", "--execute"], { cwd, bin });
  assert.equal(executed.status, 0);
  const argsLine = fs.readFileSync(log, "utf8").split("\n").find((line) => line.startsWith("ARGS="));
  assert.doesNotMatch(argsLine, /hunter2/);
  const stdin = fs.readFileSync(`${log}.stdin`, "utf8");
  assert.match(stdin, /"ACL" "SETUSER" "svc" "on" ">hunter2hunter2" "~\*" "&\*" "\+@read"/);
});
