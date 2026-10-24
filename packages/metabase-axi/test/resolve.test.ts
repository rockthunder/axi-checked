import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AxiError } from "axi-sdk-js";
import { resolveInstance, resolveCredentials, type ResolvedInstance } from "../src/resolve.js";
import { defaultConfig, setProfile, type Config } from "../src/config.js";

const ENV_KEYS = ["METABASE_URL", "METABASE_API_KEY", "METABASE_USERNAME", "METABASE_PASSWORD"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function twoProfiles(): Config {
  let cfg = defaultConfig();
  cfg = setProfile(cfg, "prod", { url: "https://prod", auth: { api_key: "k1" } });
  cfg = setProfile(cfg, "staging", { url: "https://staging", auth: { api_key: "k2" } });
  return cfg;
}

describe("resolveInstance", () => {
  it("stops (CONFIG) for a risky op with 2+ profiles and no explicit selection", () => {
    expect(() => resolveInstance({ config: twoProfiles(), risky: true })).toThrow(AxiError);
  });

  it("uses the default for a read-only op with 2+ profiles", () => {
    const r = resolveInstance({ config: twoProfiles(), risky: false });
    expect(r.name).toBe("prod");
    expect(r.source).toBe("default");
  });

  it("honors --instance over the default, even for risky ops", () => {
    const r = resolveInstance({ config: twoProfiles(), instanceFlag: "staging", risky: true });
    expect(r.name).toBe("staging");
    expect(r.source).toBe("flag");
  });

  it("errors on an unknown --instance", () => {
    expect(() => resolveInstance({ config: twoProfiles(), instanceFlag: "nope" })).toThrow(
      AxiError,
    );
  });

  it("uses the sole profile as `single` when no default is set", () => {
    const cfg: Config = {
      version: 1,
      profiles: { only: { url: "https://only", auth: { api_key: "k" } } },
    };
    const r = resolveInstance({ config: cfg, risky: true });
    expect(r.name).toBe("only");
    expect(r.source).toBe("single");
  });

  it("throws when no profiles exist", () => {
    expect(() => resolveInstance({ config: defaultConfig() })).toThrow(AxiError);
  });

  it("prefers the env instance when METABASE_URL + creds are set", () => {
    process.env.METABASE_URL = "https://env.example";
    process.env.METABASE_API_KEY = "envkey";
    const r = resolveInstance({ config: twoProfiles(), risky: true });
    expect(r.name).toBe("env");
    expect(r.source).toBe("env");
  });

  it("errors when METABASE_URL is set without env credentials", () => {
    process.env.METABASE_URL = "https://env.example";
    expect(() => resolveInstance({ config: twoProfiles() })).toThrow(AxiError);
  });
});

describe("resolveCredentials", () => {
  const cfg = twoProfiles();
  const inst = (over: Partial<ResolvedInstance>): ResolvedInstance => ({
    name: "prod",
    url: "https://prod",
    source: "default",
    profileName: "prod",
    ...over,
  });

  it("returns api_key auth from a profile key", () => {
    const auth = resolveCredentials(inst({}), cfg);
    expect(auth.scheme).toBe("api_key");
  });

  it("returns session auth from profile username/password", () => {
    let c = defaultConfig();
    c = setProfile(c, "sess", { url: "https://s", auth: { username: "u", password: "p" } });
    const auth = resolveCredentials(inst({ name: "sess", profileName: "sess" }), c);
    expect(auth.scheme).toBe("session");
  });

  it("reads env credentials for the env instance", () => {
    process.env.METABASE_API_KEY = "envkey";
    const auth = resolveCredentials(
      inst({ name: "env", source: "env", profileName: undefined }),
      cfg,
    );
    expect(auth).toEqual({ scheme: "api_key", apiKey: "envkey" });
  });
});
