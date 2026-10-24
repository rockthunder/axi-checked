import { AxiError } from "./errors.js";

function flagEqualsPrefix(flag: string): string {
  return `${flag}=`;
}

export function takeFlag(args: string[], flag: string): string | undefined {
  const equalsPrefix = flagEqualsPrefix(flag);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag) {
      const val = args[i + 1];
      args.splice(i, 2);
      return val;
    }
    if (arg.startsWith(equalsPrefix)) {
      const val = arg.slice(equalsPrefix.length);
      args.splice(i, 1);
      return val;
    }
  }
  return undefined;
}

export function takeBoolFlag(args: string[], flag: string): boolean {
  const idx = args.indexOf(flag);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

export function takeAllFlags(args: string[], flag: string): string[] {
  const result: string[] = [];
  const equalsPrefix = flagEqualsPrefix(flag);
  for (let i = 0; i < args.length; ) {
    const arg = args[i];
    if (arg === flag && i + 1 < args.length) {
      result.push(args[i + 1]);
      args.splice(i, 2);
    } else if (arg.startsWith(equalsPrefix)) {
      result.push(arg.slice(equalsPrefix.length));
      args.splice(i, 1);
    } else {
      i++;
    }
  }
  return result;
}

export function requireNumber(raw: string | undefined, label: string): number {
  if (!raw) throw new AxiError(`Missing ${label}`, "VALIDATION_ERROR");
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new AxiError(`Invalid ${label}: ${raw}`, "VALIDATION_ERROR");
  }
  return n;
}

export function takeNumber(args: string[], label: string): number {
  const raw = args.find((a) => /^\d+$/.test(a));
  if (!raw) throw new AxiError(`Missing ${label}`, "VALIDATION_ERROR");
  args.splice(args.indexOf(raw), 1);
  return Number(raw);
}

export function parseLimit(raw: string | undefined, fallback = 30): number {
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  return Math.min(n, 200);
}

const UNIVERSAL_FLAGS = new Set([
  "--help",
  "-h",
  "-R",
  "--repo",
  "--org",
  "--organization",
  "--project",
  "-p",
]);

function flagsIn(text: string): Set<string> {
  const names = new Set<string>();
  for (const m of text.matchAll(/(?<![\w-])(--[a-zA-Z][\w-]*)/g)) {
    names.add(m[1]);
  }
  return names;
}

function blockBody(lines: string[], start: number): string {
  const body: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (
      /^(?:subcommands|flags(?:\{.+\})?|examples|usage):/i.test(lines[i])
    ) {
      break;
    }
    body.push(lines[i]);
  }
  return body.join("\n");
}

/** Reject flags the subcommand help does not declare (AXI clause 6). */
export function rejectUnknownFlags(
  help: string,
  domain: string,
  sub: string | undefined,
  args: string[],
): void {
  if (sub === undefined) return;
  const lines = help.split("\n");
  const perSub = new Map<string, Set<string>>();
  const subs = new Set<string>();
  let universal: Set<string> | undefined;

  for (let i = 0; i < lines.length; i++) {
    const flagHeader = lines[i].match(/^flags(?:\{(.+)\})?:$/);
    if (flagHeader) {
      const flags = flagsIn(blockBody(lines, i + 1));
      if (flagHeader[1] === undefined) {
        universal = flags;
        continue;
      }
      for (const name of flagHeader[1].split(",").map((s) => s.trim())) {
        const existing = perSub.get(name) ?? new Set<string>();
        for (const f of flags) existing.add(f);
        perSub.set(name, existing);
        subs.add(name);
      }
      continue;
    }
    if (/^subcommands\[\d+\]:$/.test(lines[i])) {
      for (const entry of blockBody(lines, i + 1).split(",")) {
        const name = entry.trim().split(/\s+/)[0];
        if (name) subs.add(name);
      }
    }
  }

  if (!subs.has(sub)) return;
  const allowed = universal ?? perSub.get(sub) ?? new Set<string>();

  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const eqIndex = arg.indexOf("=");
    const name = eqIndex === -1 ? arg : arg.slice(0, eqIndex);
    if (!allowed.has(name) && !UNIVERSAL_FLAGS.has(name)) {
      const valid = [...allowed].sort();
      throw new AxiError(
        `Unknown flag for \`ado-axi ${domain} ${sub}\`: ${name}`,
        "VALIDATION_ERROR",
        [
          valid.length > 0
            ? `Valid flags for \`ado-axi ${domain} ${sub}\`: ${valid.join(", ")}`
            : `\`ado-axi ${domain} ${sub}\` takes no flags`,
          `Run \`ado-axi ${domain} --help\``,
        ],
      );
    }
  }
}
