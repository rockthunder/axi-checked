#!/usr/bin/env node

// A gh that fails fast on gh-axi's internal `issue view` attempts the way an
// older gh (no issueType field) and a PR number (no sub-issue data) do.
const args = process.argv.slice(2);
const json = args[args.indexOf("--json") + 1] ?? "";

if (args[0] === "issue" && args[1] === "view" && args[2] === "404") {
  process.stderr.write(
    "GraphQL: Could not resolve to an issue or pull request with the number of 404. (repository.issue)\n",
  );
  process.exitCode = 1;
} else if (
  args[0] === "issue" &&
  args[1] === "view" &&
  json.includes("issueType")
) {
  process.stderr.write(
    'Unknown JSON field: "issueType"\nAvailable fields:\n  author\n  body\n  createdAt\n  number\n  state\n  title\n',
  );
  process.exitCode = 1;
} else if (args[0] === "issue" && args[1] === "view") {
  process.stdout.write(
    `${JSON.stringify({
      number: 206,
      title: "Fixture pull request",
      state: "OPEN",
      author: { login: "fixture-author" },
      createdAt: "2026-10-01T00:00:00Z",
      body: "",
    })}\n`,
  );
} else if (args[0] === "api" && args[1] === "graphql") {
  process.stderr.write(
    "gh: Could not resolve to an Issue with the number of 206.\n",
  );
  process.exitCode = 1;
} else {
  process.stderr.write(`unsupported fake gh invocation: ${args.join(" ")}\n`);
  process.exitCode = 97;
}
