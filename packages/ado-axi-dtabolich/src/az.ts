import { execFile } from "node:child_process";
import {
  AxiError,
  azNotInstalledError,
  devopsExtensionMissingError,
  mapAzError,
  scrubTool,
} from "./errors.js";
import { orgUrl, type AdoContext } from "./context.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const MAX_BUFFER_BYTES = 20 * 1024 * 1024;

function runAz(args: string[]): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      "az",
      args,
      { maxBuffer: MAX_BUFFER_BYTES, env: process.env },
      (error, stdout, stderr) => {
        const err = error as (Error & { code?: string | number }) | null;
        if (err && err.code === "ENOENT") {
          resolve({ stdout: "", stderr: "ENOENT", exitCode: 127 });
          return;
        }
        const exitCode = err
          ? typeof err.code === "number"
            ? err.code
            : 1
          : 0;
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode,
        });
      },
    );
  });
}

export interface AzContextFlags {
  /** Include --organization from context (default true). */
  organization?: boolean;
  /** Include --project from context (default true). */
  project?: boolean;
}

function appendContextFlags(
  args: string[],
  ctx?: AdoContext,
  flags: AzContextFlags = {},
): string[] {
  const out = [...args];
  const useOrg = flags.organization !== false;
  const useProject = flags.project !== false;
  if (useOrg && ctx?.org) {
    out.push("--organization", orgUrl(ctx.org));
  }
  if (useProject && ctx?.project) {
    out.push("--project", ctx.project);
  }
  return out;
}

function throwOnFailure(result: ExecResult): void {
  if (result.stderr === "ENOENT") throw azNotInstalledError();
  if (
    /azure-devops|devops.*extension|Extension.*not.*installed/i.test(
      result.stderr,
    )
  ) {
    throw devopsExtensionMissingError();
  }
  if (result.exitCode !== 0) {
    throw mapAzError(
      [result.stderr, result.stdout].filter(Boolean).join("\n"),
      result.exitCode,
    );
  }
}

/** Run an `az` command and parse JSON stdout. */
export async function azJson<T = Json>(
  args: string[],
  ctx?: AdoContext,
  flags?: AzContextFlags,
): Promise<T> {
  const full = [
    ...appendContextFlags(args, ctx, flags),
    "--output",
    "json",
    "--only-show-errors",
  ];
  const result = await runAz(full);
  throwOnFailure(result);
  const out = result.stdout.trim();
  if (out === "") return undefined as T;
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new AxiError(
      `Unexpected CLI output: ${scrubTool(out.slice(0, 200))}`,
      "UNKNOWN",
    );
  }
}

/** Run an `az` command and return raw stdout text. */
export async function azText(
  args: string[],
  ctx?: AdoContext,
  flags?: AzContextFlags,
): Promise<string> {
  const full = [...appendContextFlags(args, ctx, flags), "--only-show-errors"];
  const result = await runAz(full);
  throwOnFailure(result);
  return result.stdout;
}

export interface InvokeOptions {
  area: string;
  resource: string;
  method?: string;
  apiVersion?: string;
  routeParameters?: Record<string, string>;
  queryParameters?: Record<string, string>;
  inFile?: string;
  ctx?: AdoContext;
}

/** `az devops invoke` — REST passthrough using Azure CLI auth. */
export async function azInvoke<T = Json>(opts: InvokeOptions): Promise<T> {
  const args = [
    "devops",
    "invoke",
    "--area",
    opts.area,
    "--resource",
    opts.resource,
    "--http-method",
    (opts.method ?? "GET").toUpperCase(),
    "--api-version",
    opts.apiVersion ?? "7.1",
  ];
  // Azure CLI expects one --route-parameters flag with space-separated
  // key=value pairs. Repeated flags drop earlier values and 404.
  if (opts.routeParameters && Object.keys(opts.routeParameters).length > 0) {
    args.push(
      "--route-parameters",
      ...Object.entries(opts.routeParameters).map(([k, v]) => `${k}=${v}`),
    );
  }
  if (opts.queryParameters && Object.keys(opts.queryParameters).length > 0) {
    args.push(
      "--query-parameters",
      ...Object.entries(opts.queryParameters).map(([k, v]) => `${k}=${v}`),
    );
  }
  if (opts.inFile) {
    args.push("--in-file", opts.inFile);
  }
  // `az devops invoke` accepts --organization but not --project (project is a route param).
  return azJson<T>(args, opts.ctx, { project: false });
}

export async function azRepos(
  subArgs: string[],
  ctx?: AdoContext,
  flags?: AzContextFlags,
): Promise<Json> {
  return azJson(["repos", ...subArgs], ctx, flags);
}

export async function azPipelines(
  subArgs: string[],
  ctx?: AdoContext,
  flags?: AzContextFlags,
): Promise<Json> {
  return azJson(["pipelines", ...subArgs], ctx, flags);
}

/** PR id-scoped commands that reject --project from Azure CLI. */
export const PR_ID_FLAGS: AzContextFlags = { project: false };
