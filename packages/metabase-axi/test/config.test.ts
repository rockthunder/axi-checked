import { describe, it, expect } from "vitest";
import {
  defaultConfig,
  hostOf,
  listProfileNames,
  removeProfile,
  setDefault,
  setProfile,
} from "../src/config.js";

describe("config profile helpers", () => {
  it("makes the first added profile the default", () => {
    let cfg = defaultConfig();
    cfg = setProfile(cfg, "prod", { url: "https://prod.example", auth: { api_key: "k1" } });
    expect(cfg.default).toBe("prod");
    cfg = setProfile(cfg, "staging", { url: "https://staging.example", auth: { api_key: "k2" } });
    expect(cfg.default).toBe("prod"); // adding a second profile does not move the default
    expect(listProfileNames(cfg)).toEqual(["prod", "staging"]);
  });

  it("reassigns the default when the current default is removed and one remains", () => {
    let cfg = defaultConfig();
    cfg = setProfile(cfg, "a", { url: "https://a", auth: { api_key: "k" } });
    cfg = setProfile(cfg, "b", { url: "https://b", auth: { api_key: "k" } });
    cfg = removeProfile(cfg, "a"); // default was "a"
    expect(cfg.default).toBe("b");
  });

  it("clears the default when removing the last-but-ambiguous default leaves 2+", () => {
    let cfg = defaultConfig();
    cfg = setProfile(cfg, "a", { url: "https://a", auth: { api_key: "k" } });
    cfg = setProfile(cfg, "b", { url: "https://b", auth: { api_key: "k" } });
    cfg = setProfile(cfg, "c", { url: "https://c", auth: { api_key: "k" } });
    cfg = setDefault(cfg, "a");
    cfg = removeProfile(cfg, "a"); // two remain → no unambiguous default
    expect(cfg.default).toBeUndefined();
  });

  it("extracts a host from a url, falling back to the raw string", () => {
    expect(hostOf("https://metabase.example.org/api")).toBe("metabase.example.org");
    expect(hostOf("not a url")).toBe("not a url");
  });
});
