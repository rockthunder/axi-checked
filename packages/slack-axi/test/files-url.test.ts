import { describe, expect, it } from "vitest";
import { assertSlackHttpsUrl } from "../src/slack/files.js";

// Corporate-build hardening: the Slack token must only be sent to Slack-owned https hosts.
describe("assertSlackHttpsUrl", () => {
  it("accepts https Slack file hosts", () => {
    for (const url of [
      "https://files.slack.com/files-pri/T1-F1/download/x.png",
      "https://acme.slack.com/files/U1/F1/x.png",
      "https://files.slack-files.com/x",
    ]) {
      expect(() => assertSlackHttpsUrl(url)).not.toThrow();
    }
  });

  it("refuses other hosts, look-alikes, http and junk", () => {
    for (const url of [
      "https://evil.example/x",
      "https://files.slack.com.evil.example/x",
      "https://notslack.com/x",
      "http://files.slack.com/x",
      "file:///etc/passwd",
      "nope",
    ]) {
      expect(() => assertSlackHttpsUrl(url), url).toThrow();
    }
  });
});
