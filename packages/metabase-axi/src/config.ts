import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_VERSION = 1;

/** Credentials stored for one profile. API key is primary; username/password is fallback. */
export interface ProfileAuth {
  api_key?: string;
  username?: string;
  password?: string;
}

/** Cached session token for session (username/password) auth. */
export interface SessionToken {
  token: string;
  obtained_at: string;
}

/** Cached summary of a profile, refreshed on auth/doctor. Never holds secrets. */
export interface ProfileCache {
  user_name?: string;
  version?: string;
  database_count?: number;
  cached_at?: string;
}

/** A named target Metabase instance. */
export interface Profile {
  url: string;
  auth: ProfileAuth;
  session?: SessionToken;
  cache?: ProfileCache;
}

export interface Config {
  version: number;
  default?: string;
  profiles: Record<string, Profile>;
}

// Paths ──────────────────────────────────────────────────────────────
export function configDir(): string {
  if (process.env.METABASE_AXI_CONFIG_DIR) {
    return process.env.METABASE_AXI_CONFIG_DIR;
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, "metabase-axi");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

// Read / write ────────────────────────────────────────────────────────
export function defaultConfig(): Config {
  return { version: CONFIG_VERSION, profiles: {} };
}

export function readConfig(): Config {
  const path = configPath();
  if (!existsSync(path)) return defaultConfig();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<Config>;
    return {
      version: parsed.version ?? CONFIG_VERSION,
      default: parsed.default,
      profiles: parsed.profiles ?? {},
    };
  } catch {
    return defaultConfig();
  }
}

export function writeConfig(cfg: Config): void {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Restrictive perms: the file holds API keys / passwords.
  writeFileSync(configPath(), `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
}

// Profile helpers ─────────────────────────────────────────────────────
export function listProfileNames(cfg: Config): string[] {
  return Object.keys(cfg.profiles).sort();
}

export function getProfile(cfg: Config, name: string): Profile | undefined {
  return cfg.profiles[name];
}

export function setProfile(cfg: Config, name: string, profile: Profile): Config {
  const profiles = { ...cfg.profiles, [name]: profile };
  // First profile added becomes the default.
  const def = cfg.default && profiles[cfg.default] ? cfg.default : name;
  return { ...cfg, profiles, default: def };
}

export function removeProfile(cfg: Config, name: string): Config {
  const profiles = { ...cfg.profiles };
  delete profiles[name];
  let def = cfg.default;
  if (def === name) {
    const remaining = Object.keys(profiles);
    def = remaining.length === 1 ? remaining[0] : undefined;
  }
  return { ...cfg, profiles, default: def };
}

export function setDefault(cfg: Config, name: string): Config {
  return { ...cfg, default: name };
}

/** Host portion of a URL for compact display (no scheme/path). Falls back to the raw url. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
