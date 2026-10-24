/**
 * Minimal argument parser for command handlers. Splits a command's args into positionals
 * and flags. `--key=value` always yields a string value; `--key value` yields a string
 * value only when `key` is in `valued` and the next token isn't a flag; otherwise `--key`
 * is a boolean `true`. A lone `-` is a positional (the stdin marker).
 */
export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(args: string[], opts: { valued?: string[] } = {}): ParsedArgs {
  const valued = new Set(opts.valued ?? []);
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === "-" || !token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = args[i + 1];
    if (valued.has(body) && next !== undefined && !next.startsWith("--")) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }

  return { positionals, flags };
}

/** Read a flag as a string, or undefined when absent / boolean-only. */
export function strFlag(parsed: ParsedArgs, name: string): string | undefined {
  const v = parsed.flags[name];
  return typeof v === "string" ? v : undefined;
}

/** Read a flag as a number, or undefined. Throws-free: returns undefined on NaN. */
export function numFlag(parsed: ParsedArgs, name: string): number | undefined {
  const v = strFlag(parsed, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** True when the flag is present in any form (boolean true or a string value). */
export function hasFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags[name] !== undefined;
}
