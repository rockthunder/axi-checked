import { AxiError, installSessionStartHooks } from "axi-sdk-js";

export const SETUP_HELP = `usage: ado-axi setup hooks
Install or repair agent SessionStart hooks for ado-axi ambient context.

examples:
  ado-axi setup hooks
`;

export async function setupCommand(
  args: string[],
): Promise<Record<string, unknown>> {
  if (args.length !== 1 || args[0] !== "hooks") {
    throw new AxiError("Unknown setup action", "VALIDATION_ERROR", [
      "Run `ado-axi setup hooks`",
    ]);
  }
  installSessionStartHooks({
    marker: "ado-axi",
    binaryNames: ["ado-axi"],
  });
  return {
    hooks: {
      status: "installed",
      integrations: "Claude Code, Codex, OpenCode",
    },
    help: [
      "Restart your agent session to receive ado-axi ambient context",
    ],
  };
}
