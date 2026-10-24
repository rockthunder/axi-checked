import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "bin", "aws-axi.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aws-axi-"));
}

function makeFakeBin(workspace, handlers = {}) {
  const bin = path.join(workspace, "bin");
  fs.mkdirSync(bin, { recursive: true });
  for (const name of ["aws", "cdk", "sam", "terraform"]) {
    const script = handlers[name] ?? defaultFake(name);
    const file = path.join(bin, name);
    fs.writeFileSync(file, script);
    fs.chmodSync(file, 0o755);
  }
  return bin;
}

function makeOnlyFakeAws(workspace, script = defaultFake("aws")) {
  const bin = path.join(workspace, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const file = path.join(bin, "aws");
  fs.writeFileSync(file, script);
  fs.chmodSync(file, 0o755);
  return bin;
}

function defaultFake(name) {
  if (name === "aws") {
    return `#!/bin/sh
case "$1 $2" in
  "sts get-caller-identity") echo '{"Account":"123456789012","Arn":"arn:aws:iam::123456789012:user/test","UserId":"test"}' ;;
  "cloudformation validate-template") echo '{"Parameters":[]}' ;;
  "cloudformation deploy") echo 'Waiting for changeset... stack deployed' ;;
  "cloudformation describe-stacks") echo '{"Stacks":[{"StackName":"web","StackStatus":"CREATE_COMPLETE"}]}' ;;
  "logs filter-log-events") echo '{"events":[{"timestamp":1,"logStreamName":"app","message":"hello from CloudWatch"}]}' ;;
  *) echo 'ok' ;;
esac
`;
  }
  return `#!/bin/sh\necho '${name} ok'\n`;
}

function run(args, options = {}) {
  const cwd = options.cwd ?? tempWorkspace();
  const env = { ...process.env, ...(options.env ?? {}) };
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env,
    encoding: "utf8"
  });
}

test("home view shows AWS context and no help-first output", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { build: "vite build" }, devDependencies: { vite: "latest" } }));
  const result = run([], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, AWS_REGION: "us-east-1" } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^bin: /);
  assert.match(result.stdout, /description: "Operate AWS hosting/);
  assert.match(result.stdout, /account: 123456789012/);
  assert.match(result.stdout, /targets\[1\]{id,type,service,source}:/);
  assert.equal(result.stderr, "");
});

test("services include hosting, load balancing, auto scaling, and cognito domains", () => {
  const result = run(["services"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Amplify/);
  assert.match(result.stdout, /Elastic Load Balancing/);
  assert.match(result.stdout, /Auto Scaling/);
  assert.match(result.stdout, /Cognito/);
});

test("discover detects frontend, backend, terraform, and sam fixtures", () => {
  const cwd = tempWorkspace();
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({
    scripts: { build: "vite build", start: "node server.js" },
    dependencies: { express: "latest" },
    devDependencies: { vite: "latest" }
  }));
  fs.writeFileSync(path.join(cwd, "main.tf"), "resource \"aws_s3_bucket\" \"site\" {}\n");
  fs.writeFileSync(path.join(cwd, "template.yaml"), "Transform: AWS::Serverless-2016-10-31\nResources: {}\n");
  const result = run(["discover"], { cwd });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /static-site/);
  assert.match(result.stdout, /app-runner/);
  assert.match(result.stdout, /terraform:root/);
  assert.match(result.stdout, /sam:template.yaml/);
});

test("unknown flags fail before calling tools", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd, {
    aws: "#!/bin/sh\necho should-not-run >> aws-called\nexit 0\n"
  });
  const result = run(["discover", "--stat"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 2);
  assert.match(result.stdout, /error: unknown flag --stat for `discover`/);
  assert.equal(fs.existsSync(path.join(cwd, "aws-called")), false);
});

test("recommend returns compact service paths for fullstack apps", () => {
  const result = run(["recommend", "--goal", "fullstack"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /paths\[3\]{id,services,fit,command}:/);
  assert.match(result.stdout, /Cognito/);
  assert.match(result.stdout, /ECS\/Fargate/);
});

test("plan runs non-mutating preview through fake aws", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  fs.writeFileSync(path.join(cwd, "template.yaml"), "Resources: {}\n");
  const result = run(["plan", "--target", "cloudformation:template.yaml", "--environment", "staging"], {
    cwd,
    env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, AWS_REGION: "us-east-1" }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /command: "aws cloudformation validate-template/);
  assert.match(result.stdout, /preview:\n  status: ok/);
});

test("missing target tools return self-correcting structured errors", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeOnlyFakeAws(cwd);
  fs.writeFileSync(path.join(cwd, "cdk.json"), JSON.stringify({ app: "node app.js" }));
  const result = run(["plan", "--target", "cdk:app", "--environment", "staging"], {
    cwd,
    env: { PATH: fakeBin, AWS_REGION: "us-east-1" }
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /error: cdk is required for cdk target/);
  assert.match(result.stdout, /Install cdk or choose another target/);
});

test("custom config targets can run repo-defined plan commands", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeOnlyFakeAws(cwd);
  fs.writeFileSync(path.join(cwd, "aws-axi.config.json"), JSON.stringify({
    targets: [
      {
        id: "api",
        type: "custom",
        service: "ECS/Fargate",
        commands: {
          plan: [process.execPath, "-e", "console.log('custom plan for ${environment}')"],
          deploy: [process.execPath, "-e", "console.log('custom deploy for ${environment}')"]
        }
      }
    ]
  }));
  const result = run(["plan", "--target", "api", "--environment", "staging"], {
    cwd,
    env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, AWS_REGION: "us-east-1" }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /custom plan for staging/);
});

test("apply is dry-run by default and production requires account confirmation", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  fs.writeFileSync(path.join(cwd, "template.yaml"), "Resources: {}\n");
  const env = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, AWS_REGION: "us-east-1" };

  const dryRun = run(["apply", "--target", "cloudformation:template.yaml", "--environment", "production", "--stack-name", "web"], { cwd, env });
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /dry_run: true/);

  const blocked = run(["apply", "--target", "cloudformation:template.yaml", "--environment", "production", "--stack-name", "web", "--execute", "--confirm-account", "000000000000"], { cwd, env });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stdout, /production apply requires --confirm-account/);
});

test("apply executes only after explicit production confirmation", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  fs.writeFileSync(path.join(cwd, "template.yaml"), "Resources: {}\n");
  const result = run([
    "apply",
    "--target",
    "cloudformation:template.yaml",
    "--environment",
    "production",
    "--stack-name",
    "web",
    "--execute",
    "--confirm-account",
    "123456789012"
  ], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, AWS_REGION: "us-east-1" } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry_run: false/);
  assert.match(result.stdout, /stack deployed/);
});

test("credential errors are structured and redact secrets", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd, {
    aws: "#!/bin/sh\necho 'AWS_SECRET_ACCESS_KEY=abc123 expired' >&2\nexit 1\n"
  });
  const result = run(["doctor"], { cwd, env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /credentials,error/);
  assert.match(result.stdout, /AWS_SECRET_ACCESS_KEY=<redacted>/);
  assert.doesNotMatch(result.stdout, /abc123/);
});

test("logs query uses fake CloudWatch response", () => {
  const cwd = tempWorkspace();
  const fakeBin = makeFakeBin(cwd);
  const result = run(["logs", "--log-group", "/aws/lambda/app"], {
    cwd,
    env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /events\[1\]{time,stream,message}:/);
  assert.match(result.stdout, /hello from CloudWatch/);
});

test("skill generate check fails when stale and passes after generation", () => {
  const cwd = tempWorkspace();
  const stale = run(["skill", "generate", "--check"], { cwd });
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /generated skill is stale or missing/);

  const generated = run(["skill", "generate"], { cwd });
  assert.equal(generated.status, 0);
  assert.equal(fs.existsSync(path.join(cwd, "SKILL.md")), true);

  const checked = run(["skill", "generate", "--check"], { cwd });
  assert.equal(checked.status, 0);
  assert.equal(checked.stdout, "skill: up-to-date");
});

test("optional live AWS doctor is gated behind AWS_AXI_LIVE_TESTS", { skip: process.env.AWS_AXI_LIVE_TESTS !== "1" }, () => {
  const result = run(["doctor"], { env: process.env });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /checks\[/);
});
