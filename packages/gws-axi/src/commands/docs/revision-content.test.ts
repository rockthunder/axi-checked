import { describe, expect, it } from "vitest";
import { assertGoogleHttpsUrl } from "./revision-content.js";

// Corporate-build hardening: the OAuth bearer token must never be sent to a non-Google URL that
// came back inside an API response.
describe("assertGoogleHttpsUrl", () => {
  it("accepts https Google export hosts", () => {
    for (const url of [
      "https://docs.google.com/feeds/download/documents/export/Export?id=1&revision=2",
      "https://www.googleapis.com/drive/v3/files/1/revisions/2",
      "https://doc-0c-1k-docs.googleusercontent.com/export/x",
    ]) {
      expect(() => assertGoogleHttpsUrl(url)).not.toThrow();
    }
  });

  it("refuses other hosts, look-alikes, plain http and junk", () => {
    for (const url of [
      "https://evil.example/export",
      "https://docs.google.com.evil.example/export",
      "https://notgoogle.com/export",
      "http://docs.google.com/export",
      "file:///etc/passwd",
      "not a url",
    ]) {
      expect(() => assertGoogleHttpsUrl(url), url).toThrow();
    }
  });
});
