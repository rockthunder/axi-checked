import { AxiError } from "axi-sdk-js";
import {
  getProfile,
  hostOf,
  listProfileNames,
  readConfig,
  setProfile,
  writeConfig,
  type Config,
  type SessionToken,
} from "./config.js";
import { MetabaseClient, type ResolvedAuth } from "./metabase/client.js";

export type InstanceSource = "env" | "flag" | "default" | "single";

export interface ResolvedInstance {
  /** Display name: profile name, or "env". */
  name: string;
  url: string;
  source: InstanceSource;
  /** Set when resolved from a config profile (enables session-token persistence). */
  profileName?: string;
}

export interface ResolveOptions {
  instanceFlag?: string;
  /** True for mutating or potentially expensive ops (ad-hoc query, card run). */
  risky?: boolean;
  config?: Config;
}

function hasEnvCreds(): boolean {
  return (
    !!process.env.METABASE_API_KEY ||
    (!!process.env.METABASE_USERNAME && !!process.env.METABASE_PASSWORD)
  );
}

function ambiguous(names: string[], risky: boolean): AxiError {
  return new AxiError(
    "Multiple Metabase profiles are configured; the target is ambiguous",
    "CONFIG",
    [
      `Specify one with --instance <name> (configured: ${names.join(", ")})`,
      risky
        ? "Expensive/mutating commands never fall back to the default — be explicit"
        : "Or set a default with `metabase-axi auth use <name>`",
    ],
  );
}

/**
 * Resolve the target instance per the precedence in
 * specs/behaviors/instance-resolution.md: env > --instance > default > single,
 * stopping for ambiguity on risky ops with 2+ profiles.
 */
export function resolveInstance(opts: ResolveOptions = {}): ResolvedInstance {
  const cfg = opts.config ?? readConfig();

  const envUrl = process.env.METABASE_URL;
  if (envUrl) {
    if (!hasEnvCreds()) {
      throw new AxiError("METABASE_URL is set but no env credentials were found", "CONFIG", [
        "Set METABASE_API_KEY (or METABASE_USERNAME + METABASE_PASSWORD)",
        "Or unset METABASE_URL to use a configured profile",
      ]);
    }
    return { name: "env", url: envUrl, source: "env" };
  }

  if (opts.instanceFlag) {
    const profile = getProfile(cfg, opts.instanceFlag);
    if (!profile) {
      const names = listProfileNames(cfg);
      throw new AxiError(`No profile named "${opts.instanceFlag}"`, "CONFIG", [
        names.length
          ? `Configured profiles: ${names.join(", ")}`
          : "Run `metabase-axi auth add <name> --url <url> --api-key <key>`",
      ]);
    }
    return {
      name: opts.instanceFlag,
      url: profile.url,
      source: "flag",
      profileName: opts.instanceFlag,
    };
  }

  const names = listProfileNames(cfg);
  if (names.length === 0) {
    throw new AxiError("No Metabase profiles configured", "CONFIG", [
      "Run `metabase-axi auth add <name> --url <url> --api-key <key>`",
      "Or set METABASE_URL + METABASE_API_KEY for a one-off",
    ]);
  }
  if (opts.risky && names.length >= 2) {
    throw ambiguous(names, true);
  }
  if (cfg.default && getProfile(cfg, cfg.default)) {
    return {
      name: cfg.default,
      url: cfg.profiles[cfg.default].url,
      source: "default",
      profileName: cfg.default,
    };
  }
  if (names.length === 1) {
    return {
      name: names[0],
      url: cfg.profiles[names[0]].url,
      source: "single",
      profileName: names[0],
    };
  }
  throw ambiguous(names, false);
}

/** Resolve credentials for an instance per specs/behaviors/credential-resolution.md. */
export function resolveCredentials(instance: ResolvedInstance, cfg: Config): ResolvedAuth {
  if (instance.source === "env") {
    const apiKey = process.env.METABASE_API_KEY;
    if (apiKey) return { scheme: "api_key", apiKey };
    const username = process.env.METABASE_USERNAME;
    const password = process.env.METABASE_PASSWORD;
    if (username && password) return { scheme: "session", username, password };
    throw new AxiError("No env credentials for the env instance", "CONFIG", [
      "Set METABASE_API_KEY (or METABASE_USERNAME + METABASE_PASSWORD)",
    ]);
  }

  const profile = getProfile(cfg, instance.profileName as string);
  if (!profile) {
    throw new AxiError(`Profile "${instance.name}" not found`, "CONFIG", []);
  }
  if (profile.auth.api_key) {
    return { scheme: "api_key", apiKey: profile.auth.api_key };
  }
  if (profile.auth.username && profile.auth.password) {
    return {
      scheme: "session",
      username: profile.auth.username,
      password: profile.auth.password,
      token: profile.session?.token,
    };
  }
  throw new AxiError(`Profile "${instance.name}" has no credentials`, "CONFIG", [
    `Re-add it: metabase-axi auth add ${instance.name} --url ${profile.url} --api-key <key>`,
  ]);
}

export interface ResolvedClient {
  instance: ResolvedInstance;
  client: MetabaseClient;
  credSource: "env" | "config";
}

/** Resolve instance + credentials and build a ready client. */
export function createClient(opts: ResolveOptions = {}): ResolvedClient {
  const cfg = opts.config ?? readConfig();
  const instance = resolveInstance({ ...opts, config: cfg });
  const auth = resolveCredentials(instance, cfg);
  const client = new MetabaseClient({
    baseUrl: instance.url,
    auth,
    onSession: instance.profileName
      ? (token) => persistSession(instance.profileName as string, token)
      : undefined,
  });
  return {
    instance,
    client,
    credSource: instance.source === "env" ? "env" : "config",
  };
}

/** Persist a freshly obtained session token back to its profile. */
function persistSession(profileName: string, token: SessionToken): void {
  const cfg = readConfig();
  const profile = getProfile(cfg, profileName);
  if (!profile) return;
  writeConfig(setProfile(cfg, profileName, { ...profile, session: token }));
}

/** "name (host)" — the instance label echoed by data-bearing commands. */
export function instanceLabel(instance: ResolvedInstance): string {
  return `${instance.name} (${hostOf(instance.url)})`;
}
