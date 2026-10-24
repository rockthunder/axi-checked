import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "../errors.js";
import type { AdoContext } from "../context.js";
import { azInvoke } from "../az.js";
import { takeFlag } from "../args.js";

export const API_HELP = `usage: ado-axi api --area <area> --resource <resource> [flags]
flags:
  --area <name>, --resource <name>, --method GET|POST|PATCH|PUT|DELETE, --api-version <ver>
  --route <k=v> (repeatable), --query-param <k=v> (repeatable), --body <json>
notes:
  Escape hatch around \`az devops invoke\`. Prefer typed ado-axi commands when available.
examples:
  ado-axi api --area git --resource repositories --route project=MyProject
  ado-axi api --area git --resource pullRequests --route project=MyProject --query-param searchCriteria.status=active
`;

export async function apiCommand(
  args: string[],
  ctx?: AdoContext,
): Promise<Record<string, unknown>> {
  const area = takeFlag(args, "--area");
  const resource = takeFlag(args, "--resource");
  const method = takeFlag(args, "--method") ?? "GET";
  const apiVersion = takeFlag(args, "--api-version") ?? "7.1";
  const body = takeFlag(args, "--body");

  const routeParameters: Record<string, string> = {};
  const queryParameters: Record<string, string> = {};

  // Re-scan remaining args for repeatable --route / --query-param
  for (let i = 0; i < args.length; ) {
    const arg = args[i];
    if ((arg === "--route" || arg === "--query-param") && i + 1 < args.length) {
      const [k, ...rest] = args[i + 1].split("=");
      if (!k || rest.length === 0) {
        throw new AxiError(
          `${arg} expects key=value`,
          "VALIDATION_ERROR",
        );
      }
      const value = rest.join("=");
      if (arg === "--route") routeParameters[k] = value;
      else queryParameters[k] = value;
      args.splice(i, 2);
      continue;
    }
    if (arg.startsWith("--route=") || arg.startsWith("--query-param=")) {
      const raw = arg.includes("--route=")
        ? arg.slice("--route=".length)
        : arg.slice("--query-param=".length);
      const [k, ...rest] = raw.split("=");
      if (!k || rest.length === 0) {
        throw new AxiError(
          `${arg.split("=")[0]} expects key=value`,
          "VALIDATION_ERROR",
        );
      }
      const value = rest.join("=");
      if (arg.startsWith("--route=")) routeParameters[k] = value;
      else queryParameters[k] = value;
      args.splice(i, 1);
      continue;
    }
    i++;
  }

  if (!area || !resource) {
    throw new AxiError(
      "--area and --resource are required",
      "VALIDATION_ERROR",
      ["ado-axi api --area git --resource repositories --route project=<project>"],
    );
  }

  if (ctx?.project && !routeParameters.project) {
    routeParameters.project = ctx.project;
  }

  let inFile: string | undefined;
  let dir: string | undefined;
  try {
    if (body) {
      dir = mkdtempSync(join(tmpdir(), "ado-axi-api-"));
      inFile = join(dir, "body.json");
      writeFileSync(inFile, body);
    }
    const result = await azInvoke({
      area,
      resource,
      method,
      apiVersion,
      routeParameters,
      queryParameters,
      inFile,
      ctx,
    });
    return {
      api: { area, resource, method },
      result,
      help: ["Prefer typed `ado-axi pr|repo|ref|run` commands when possible"],
    };
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}
