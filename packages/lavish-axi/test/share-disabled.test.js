import assert from "node:assert/strict";
import test from "node:test";

import { shareCommand } from "../src/cli.js";
import { publishToHtmlApp, updateHtmlApp } from "../src/html-app.js";

test("hosted share is disabled in this build (no data leaves the machine)", async () => {
  let fetched = false;
  const fetchSpy = async () => {
    fetched = true;
    throw new Error("network must not be reached");
  };

  await assert.rejects(() => shareCommand(["page.html"]), /disabled in this build/);
  await assert.rejects(() => publishToHtmlApp("<p>x</p>", { fetch: fetchSpy }), /disabled in this build/);
  await assert.rejects(
    () => updateHtmlApp("site", "<p>x</p>", { updateKey: "k", fetch: fetchSpy }),
    /disabled in this build/,
  );
  assert.equal(fetched, false);
});
