import { AxiError } from "axi-sdk-js";
import { hostOf } from "../config.js";
import { createClient, instanceLabel } from "../resolve.js";
import { currentUser, databaseCount } from "../metabase/server.js";
import { parseArgs, strFlag } from "../flags.js";
import type { StructuredOutput } from "../output.js";

export const DOCTOR_HELP = `usage: metabase-axi doctor [flags]
flags:
  --instance <name>   profile to probe (default: configured default / env)
checks:
  reachable, auth, credential source (env|config), database count
exit:
  0 on ok/warn, 1 on a hard failure (unreachable or invalid auth)`;

interface Check {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export async function doctorCommand(args: string[]): Promise<StructuredOutput> {
  const parsed = parseArgs(args, { valued: ["instance"] });
  const instanceFlag = strFlag(parsed, "instance");

  let resolved;
  try {
    resolved = createClient({ instanceFlag, risky: false });
  } catch (error) {
    process.exitCode = 1;
    if (error instanceof AxiError) {
      return {
        checks: [{ name: "config", status: "fail", detail: error.message }],
        help: error.suggestions,
      };
    }
    throw error;
  }

  const { instance, client, credSource } = resolved;
  const checks: Check[] = [];
  let authed = false;

  try {
    const user = await currentUser(client);
    checks.push({ name: "reachable", status: "ok", detail: hostOf(instance.url) });
    checks.push({
      name: "auth",
      status: "ok",
      detail: `${client.scheme} as ${user.common_name ?? user.email}`,
    });
    authed = true;
  } catch (error) {
    const err = error as AxiError;
    if (err.code === "UNREACHABLE") {
      checks.push({ name: "reachable", status: "fail", detail: err.message });
    } else {
      checks.push({ name: "reachable", status: "ok", detail: hostOf(instance.url) });
      checks.push({ name: "auth", status: "fail", detail: err.message });
    }
  }

  checks.push({
    name: "source",
    status: "ok",
    detail: `${client.scheme} from ${credSource}`,
  });

  if (authed) {
    try {
      const n = await databaseCount(client);
      checks.push({ name: "databases", status: "ok", detail: String(n) });
    } catch {
      checks.push({ name: "databases", status: "warn", detail: "could not list databases" });
    }
  }

  const failed = checks.some((c) => c.status === "fail");
  if (failed) process.exitCode = 1;

  return {
    instance: instanceLabel(instance),
    checks,
    help: failed
      ? [
          "Fix credentials with `metabase-axi auth login` or re-add the profile",
          "Check the instance URL / VPN if unreachable",
        ]
      : ["Run `metabase-axi` for the home view"],
  };
}
