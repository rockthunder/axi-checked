import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { isVersionOnlyArgv, VERSION } from "../src/cli.js";

const execFileAsync = promisify(execFile);
const BIN = fileURLToPath(new URL("../bin/lavish-axi.js", import.meta.url));

test("isVersionOnlyArgv matches exactly the SDK's version-flag shapes", () => {
  for (const flag of ["--version", "-v", "-V"]) {
    assert.equal(isVersionOnlyArgv([flag]), true);
  }
  for (const argv of [[], ["--help"], ["open"], ["--version", "extra"], ["open", "--version"]]) {
    assert.equal(isVersionOnlyArgv(argv), false);
  }
});

test("--version prints the version fast and skips state-dir init", async (t) => {
  const stateParent = await mkdtemp(path.join(tmpdir(), "lavish-version-"));
  const stateDir = path.join(stateParent, "state");
  t.after(async () => {
    await rm(stateParent, { recursive: true, force: true });
  });

  const env = { ...process.env, LAVISH_AXI_STATE_DIR: stateDir };

  for (const flag of ["--version", "-v", "-V"]) {
    const { stdout } = await execFileAsync(process.execPath, [BIN, flag], { env });

    assert.equal(stdout, `${VERSION}
`);
  }

  // The heavy init is provably skipped: the state directory was never created.
  assert.equal(existsSync(stateDir), false);
});

test("a non-version invocation still runs the state-dir init the fast path skips", async (t) => {
  const stateParent = await mkdtemp(path.join(tmpdir(), "lavish-version-control-"));
  const stateDir = path.join(stateParent, "state");
  t.after(async () => {
    await rm(stateParent, { recursive: true, force: true });
  });

  await execFileAsync(process.execPath, [BIN, "design"], {
    env: { ...process.env, LAVISH_AXI_STATE_DIR: stateDir },
  });

  assert.equal(existsSync(stateDir), true);
});
