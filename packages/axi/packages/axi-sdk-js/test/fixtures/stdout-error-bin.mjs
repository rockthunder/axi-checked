import { Writable } from "node:stream";
import { runAxiCli } from "../../src/cli.ts";

const mode = process.argv[2];
const chunks = [];

class FixtureStdout extends Writable {
  _write(chunk, _encoding, callback) {
    if (mode === "control") {
      chunks.push(chunk.toString());
      callback();
      return;
    }

    const error = new Error(`write ${mode}`);
    error.code = mode;
    error.errno = mode === "EPIPE" ? -32 : -13;
    error.syscall = "write";
    callback(error);
  }
}

if (!["control", "EPIPE", "EACCES"].includes(mode)) {
  throw new Error("usage: stdout-error-bin.mjs <control|EPIPE|EACCES>");
}

await runAxiCli({
  argv: ["--help"],
  description: "Fixture CLI",
  topLevelHelp: "fixture help",
  home: async () => "home output",
  commands: {},
  stdout: new FixtureStdout(),
});

await new Promise((resolve) => setImmediate(resolve));

if (mode === "control") {
  process.stdout.write(chunks.join(""));
}
