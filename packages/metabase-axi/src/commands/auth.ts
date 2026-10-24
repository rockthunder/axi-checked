import { AxiError } from "axi-sdk-js";
import {
  getProfile,
  hostOf,
  listProfileNames,
  readConfig,
  removeProfile,
  setDefault,
  setProfile,
  writeConfig,
  type Config,
  type Profile,
  type ProfileAuth,
  type SessionToken,
} from "../config.js";
import { MetabaseClient, type ResolvedAuth } from "../metabase/client.js";
import { profileSummary } from "../metabase/server.js";
import { parseArgs, strFlag } from "../flags.js";
import type { StructuredOutput } from "../output.js";

export const AUTH_HELP = `usage: metabase-axi auth <subcommand> [flags]
subcommands[5]:
  add <name>     register a profile (--url, --api-key | --username/--password)
  list           show configured profiles and the default
  use <name>     set the default profile
  login [name]   obtain/refresh a session token (session auth)
  remove <name>  delete a profile
notes:
  - Credentials are stored locally; secrets are never printed.
  - Env vars (METABASE_URL, METABASE_API_KEY, METABASE_USERNAME/PASSWORD) override config.
examples:
  metabase-axi auth add prod --url https://metabase.example.org --api-key mb_...
  metabase-axi auth use prod`;

export async function authCommand(args: string[]): Promise<StructuredOutput> {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case undefined:
    case "list":
      return authList();
    case "add":
      return authAdd(rest);
    case "use":
      return authUse(rest);
    case "login":
      return authLogin(rest);
    case "remove":
      return authRemove(rest);
    default:
      throw new AxiError(`Unknown auth subcommand: ${sub}`, "VALIDATION_ERROR", [
        "Run `metabase-axi auth --help` for usage",
      ]);
  }
}

function toResolvedAuth(auth: ProfileAuth): ResolvedAuth {
  if (auth.api_key) return { scheme: "api_key", apiKey: auth.api_key };
  if (auth.username && auth.password) {
    return { scheme: "session", username: auth.username, password: auth.password };
  }
  throw new AxiError("Profile has no usable credentials", "CONFIG", [
    "Provide --api-key or --username/--password",
  ]);
}

function profileTable(cfg: Config): Array<Record<string, string>> {
  return listProfileNames(cfg).map((name) => {
    const p = cfg.profiles[name];
    return {
      name,
      host: hostOf(p.url),
      auth: p.auth.api_key ? "api_key" : "session",
      default: name === cfg.default ? "yes" : "",
    };
  });
}

async function authAdd(rest: string[]): Promise<StructuredOutput> {
  const parsed = parseArgs(rest, {
    valued: ["url", "api-key", "username", "password"],
  });
  const name = parsed.positionals[0];
  if (!name) {
    throw new AxiError("A profile name is required", "VALIDATION_ERROR", [
      "metabase-axi auth add <name> --url <url> --api-key <key>",
    ]);
  }
  const url = strFlag(parsed, "url");
  if (!url) {
    throw new AxiError("--url is required", "VALIDATION_ERROR", [
      "metabase-axi auth add <name> --url https://metabase.example.org --api-key <key>",
    ]);
  }
  const apiKey = strFlag(parsed, "api-key");
  const username = strFlag(parsed, "username");
  const password = strFlag(parsed, "password");

  let auth: ProfileAuth;
  if (apiKey) auth = { api_key: apiKey };
  else if (username && password) auth = { username, password };
  else {
    throw new AxiError("No credentials provided", "VALIDATION_ERROR", [
      "Pass --api-key <key>, or --username <u> --password <p>",
    ]);
  }

  // Validate before persisting (throws AUTH/UNREACHABLE on failure).
  let session: SessionToken | undefined;
  const client = new MetabaseClient({
    baseUrl: url,
    auth: toResolvedAuth(auth),
    onSession: (t) => {
      session = t;
    },
  });
  const cache = await profileSummary(client);

  const cfg = readConfig();
  const profile: Profile = { url, auth, cache, session };
  const updated = setProfile(cfg, name, profile);
  writeConfig(updated);

  return {
    added: name,
    instance: `${name} (${hostOf(url)})`,
    auth: auth.api_key ? "api_key" : "session",
    user: cache.user_name,
    databases: cache.database_count,
    default: updated.default,
    profiles: profileTable(updated),
    help: ["Run `metabase-axi doctor` to verify", "Run `metabase-axi` for the home view"],
  };
}

function authList(): StructuredOutput {
  const cfg = readConfig();
  const names = listProfileNames(cfg);
  if (names.length === 0) {
    return {
      message: "No profiles configured",
      help: [
        "Run `metabase-axi auth add <name> --url <url> --api-key <key>`",
        "Or set METABASE_URL + METABASE_API_KEY for a one-off",
      ],
    };
  }
  const out: StructuredOutput = {
    profiles: profileTable(cfg),
    default: cfg.default ?? "(none)",
  };
  if (process.env.METABASE_URL) {
    out.note = "METABASE_URL env override is active and shadows these profiles this session";
  }
  out.help = [
    "Run `metabase-axi auth use <name>` to set the default",
    "Run `metabase-axi doctor` to check connectivity",
  ];
  return out;
}

function authUse(rest: string[]): StructuredOutput {
  const name = rest[0];
  if (!name) {
    throw new AxiError("A profile name is required", "VALIDATION_ERROR", [
      "metabase-axi auth use <name>",
    ]);
  }
  const cfg = readConfig();
  if (!getProfile(cfg, name)) {
    throw new AxiError(`No profile named "${name}"`, "CONFIG", [
      `Configured profiles: ${listProfileNames(cfg).join(", ") || "(none)"}`,
    ]);
  }
  if (cfg.default === name) {
    return {
      default: name,
      message: `"${name}" is already the default`,
      profiles: profileTable(cfg),
    };
  }
  const updated = setDefault(cfg, name);
  writeConfig(updated);
  return {
    default: name,
    profiles: profileTable(updated),
    help: ["Run `metabase-axi` for the home view of the new default"],
  };
}

async function authLogin(rest: string[]): Promise<StructuredOutput> {
  const parsed = parseArgs(rest, { valued: ["instance"] });
  const cfg = readConfig();
  const names = listProfileNames(cfg);
  const targetName =
    parsed.positionals[0] ??
    strFlag(parsed, "instance") ??
    cfg.default ??
    (names.length === 1 ? names[0] : undefined);
  if (!targetName) {
    throw new AxiError("Which profile? Specify a name", "CONFIG", [
      `Configured profiles: ${names.join(", ") || "(none)"}`,
    ]);
  }
  const profile = getProfile(cfg, targetName);
  if (!profile) {
    throw new AxiError(`No profile named "${targetName}"`, "CONFIG", [
      `Configured profiles: ${names.join(", ") || "(none)"}`,
    ]);
  }
  if (!profile.auth.username || !profile.auth.password) {
    return {
      message: `Profile "${targetName}" uses API-key auth — no session login needed`,
      help: ["API-key profiles never expire; nothing to refresh"],
    };
  }

  let session: SessionToken | undefined;
  const client = new MetabaseClient({
    baseUrl: profile.url,
    auth: { scheme: "session", username: profile.auth.username, password: profile.auth.password },
    onSession: (t) => {
      session = t;
    },
  });
  await client.login();
  const cache = await profileSummary(client);
  writeConfig(setProfile(cfg, targetName, { ...profile, session, cache }));

  return {
    logged_in: targetName,
    user: cache.user_name,
    help: ["Session token cached; run `metabase-axi doctor` to verify"],
  };
}

function authRemove(rest: string[]): StructuredOutput {
  const name = rest[0];
  if (!name) {
    throw new AxiError("A profile name is required", "VALIDATION_ERROR", [
      "metabase-axi auth remove <name>",
    ]);
  }
  const cfg = readConfig();
  if (!getProfile(cfg, name)) {
    throw new AxiError(`No profile named "${name}"`, "CONFIG", [
      `Configured profiles: ${listProfileNames(cfg).join(", ") || "(none)"}`,
    ]);
  }
  const updated = removeProfile(cfg, name);
  writeConfig(updated);
  return {
    removed: name,
    default: updated.default ?? "(none)",
    profiles: profileTable(updated),
  };
}
