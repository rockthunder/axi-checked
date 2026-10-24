import assert from "node:assert/strict";
import test from "node:test";

import {
  createHtmlAppPayload,
  createHtmlAppUpdatePayload,
  createUnpublishedPageHtml,
  hostRejectedShareWrite,
  htmlAppApiUrl,
  normalizeSiteId,
  publishedDespiteError,
  publishToHtmlApp,
  updateHtmlApp,
} from "../src/html-app.js";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function recordingFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  return { fetchImpl, calls };
}

test("createHtmlAppPayload sends html_content and only adds a password when provided", () => {
  assert.deepEqual(createHtmlAppPayload("<h1>Hi</h1>"), { html_content: "<h1>Hi</h1>" });
  assert.deepEqual(createHtmlAppPayload("<h1>Hi</h1>", { password: "  secret " }), {
    html_content: "<h1>Hi</h1>",
    password: "secret",
  });
  assert.deepEqual(createHtmlAppPayload("<h1>Hi</h1>", { password: "   " }), { html_content: "<h1>Hi</h1>" });
});

test("htmlAppApiUrl defaults to ht-ml.app and honors the override env", () => {
  assert.equal(htmlAppApiUrl({}), "https://api.ht-ml.app");
  assert.equal(htmlAppApiUrl({ LAVISH_AXI_HTML_APP_API_URL: "http://127.0.0.1:9/" }), "http://127.0.0.1:9");
});

test("a transport failure is not reported as published", async () => {
  const fetchImpl = () => Promise.reject(new Error("socket hang up"));

  await assert.rejects(
    () => publishToHtmlApp("<h1>Hi</h1>", { fetch: fetchImpl, env: {} }),
    (error) => {
      assert.equal(publishedDespiteError(error), null, "a lost response proves nothing landed");
      assert.equal(hostRejectedShareWrite(error), false, "and it is not a host rejection either");
      return true;
    },
  );
});

test("a site_id the host echoes cannot smuggle flags into what Lavish reports", async () => {
  // The echoed id reaches a backticked republish command an agent may run, so `abc123 --password
  // evil` must not survive. It is a path segment; anything normalizeSiteId refuses is not one.
  const { fetchImpl } = recordingFetch(jsonResponse(200, { site_id: "abc123 --password evil", url: "https://x/" }));
  const updated = await updateHtmlApp("abc123", "<h1>Hi</h1>", {
    fetch: fetchImpl,
    env: {},
    updateKey: "uk",
  });

  assert.equal(updated.site_id, "abc123", "the locally validated id wins over a malformed echo");

  const { fetchImpl: goodFetch } = recordingFetch(jsonResponse(200, { site_id: "renamed", url: "https://x/" }));
  const renamed = await updateHtmlApp("abc123", "<h1>Hi</h1>", { fetch: goodFetch, env: {}, updateKey: "uk" });
  assert.equal(renamed.site_id, "renamed", "a well-formed echo is still honored");
});

test("normalizeSiteId accepts an id and explains that a URL is not one", () => {
  assert.equal(normalizeSiteId(" abc123 "), "abc123");
  assert.throws(() => normalizeSiteId("https://abc123.ht-ml.app/"), /site_id/);
  assert.throws(() => normalizeSiteId("abc/../123"), /site_id/);
  assert.throws(() => normalizeSiteId(""), /site_id/);
});

test("normalizeSiteId refuses a dot segment that would resolve away from the site path", () => {
  // `..` survives encodeURIComponent, so /v1/sites/.. would collapse to the collection root and
  // PUT the artifact there instead of at a site.
  assert.throws(() => normalizeSiteId("."), /not a valid site_id/);
  assert.throws(() => normalizeSiteId(".."), /not a valid site_id/);
  assert.throws(() => normalizeSiteId(" .. "), /not a valid site_id/);
  assert.throws(() => normalizeSiteId("..."), /not a valid site_id/);
  assert.equal(normalizeSiteId("..abc"), "..abc");
});

test("createHtmlAppUpdatePayload omits the password to preserve it and sends one to rotate it", () => {
  assert.deepEqual(createHtmlAppUpdatePayload("<h1>Hi</h1>"), { html_content: "<h1>Hi</h1>" });
  assert.deepEqual(createHtmlAppUpdatePayload("<h1>Hi</h1>", { password: "secret" }), {
    html_content: "<h1>Hi</h1>",
    password: "secret",
  });
});

test("createHtmlAppUpdatePayload never sends an empty password the host accepts and ignores", () => {
  // Probed live: PUT with password "" answers 200 and leaves the original password working, so
  // sending one would make Lavish report a page as public while it is still gated.
  for (const password of ["", "   ", null, undefined]) {
    assert.deepEqual(createHtmlAppUpdatePayload("<h1>Hi</h1>", { password }), { html_content: "<h1>Hi</h1>" });
  }
});

test("the unpublished placeholder is a self-contained page that says the content is gone", () => {
  const html = createUnpublishedPageHtml();

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /unpublished/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /https?:\/\//i);
});
