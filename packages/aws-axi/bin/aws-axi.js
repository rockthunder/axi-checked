#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const DESCRIPTION = "Operate AWS hosting, backend, database, and AI services through safe AXI workflows";
const VERSION = "0.1.0";
const PREVIEW_LIMIT = 1000;
const GLOBAL_VALUE_FLAGS = new Set(["--profile", "--region", "--cwd"]);
const GLOBAL_BOOLEAN_FLAGS = new Set(["--help"]);

const COMMANDS = {
  home: {
    value: new Set(),
    boolean: new Set(["--help"]),
    help: helpHome
  },
  doctor: {
    value: new Set(),
    boolean: new Set(["--help"]),
    help: helpDoctor
  },
  services: {
    value: new Set(["--capability", "--fields"]),
    boolean: new Set(["--help"]),
    help: helpServices
  },
  discover: {
    value: new Set(["--fields"]),
    boolean: new Set(["--full", "--help"]),
    help: helpDiscover
  },
  recommend: {
    value: new Set(["--goal"]),
    boolean: new Set(["--help"]),
    help: helpRecommend
  },
  plan: {
    value: new Set(["--target", "--environment", "--stack-name"]),
    boolean: new Set(["--full", "--help"]),
    help: helpPlan
  },
  apply: {
    value: new Set(["--target", "--environment", "--confirm-account", "--stack-name"]),
    boolean: new Set(["--execute", "--full", "--help"]),
    help: helpApply
  },
  status: {
    value: new Set(["--target", "--stack-name"]),
    boolean: new Set(["--full", "--help"]),
    help: helpStatus
  },
  logs: {
    value: new Set(["--target", "--log-group", "--limit"]),
    boolean: new Set(["--full", "--help"]),
    help: helpLogs
  },
  "hooks install": {
    value: new Set(["--agent", "--scope"]),
    boolean: new Set(["--execute", "--help"]),
    help: helpHooksInstall
  },
  "skill generate": {
    value: new Set(["--output"]),
    boolean: new Set(["--check", "--help"]),
    help: helpSkillGenerate
  }
};

const SERVICE_DOMAINS = [
  {
    capability: "easy-hosting",
    services: "Amplify|App Runner|Elastic Beanstalk|Lightsail",
    use: "fast hosting paths for common apps"
  },
  {
    capability: "frontend-web",
    services: "S3|CloudFront|Route 53|ACM",
    use: "static sites, DNS, TLS, and CDN"
  },
  {
    capability: "backend-compute",
    services: "Lambda|API Gateway|ECS/Fargate|ECR|EC2",
    use: "APIs, containers, functions, and servers"
  },
  {
    capability: "traffic-scaling",
    services: "Elastic Load Balancing|Auto Scaling|CloudFront",
    use: "routing, health checks, scaling, and edge delivery"
  },
  {
    capability: "auth-identity",
    services: "Cognito|IAM",
    use: "user auth, federation, and access control"
  },
  {
    capability: "data",
    services: "RDS|Aurora|DynamoDB|ElastiCache|S3",
    use: "relational, key-value, cache, and object data"
  },
  {
    capability: "ai",
    services: "Bedrock|SageMaker|Lambda/API Gateway AI backends",
    use: "model APIs, training, inference, and AI app backends"
  },
  {
    capability: "operations-secrets",
    services: "CloudWatch|CloudTrail|Secrets Manager|SSM Parameter Store",
    use: "logs, audit, secrets, and runtime configuration"
  }
];

const RECOMMENDATIONS = {
  website: [
    ["static-site", "S3|CloudFront|Route 53|ACM", "best for generated static sites", "aws-axi plan --target static-site --environment production"],
    ["managed-web", "Amplify", "best for connected frontend repos", "aws-axi services --capability easy-hosting"],
    ["container-web", "App Runner|ECR", "best for simple containerized web apps", "aws-axi discover"]
  ],
  api: [
    ["serverless-api", "Lambda|API Gateway|DynamoDB|Cognito", "best for event-driven APIs", "aws-axi discover"],
    ["container-api", "ECS/Fargate|ECR|ELB|Auto Scaling", "best for long-running services", "aws-axi services --capability traffic-scaling"],
    ["managed-api", "App Runner|RDS|Secrets Manager", "best for simple web services", "aws-axi services --capability easy-hosting"]
  ],
  database: [
    ["relational", "RDS|Aurora|Secrets Manager", "best for SQL workloads", "aws-axi services --capability data"],
    ["key-value", "DynamoDB", "best for serverless key-value access", "aws-axi services --capability data"],
    ["cache", "ElastiCache", "best for low-latency caching", "aws-axi services --capability data"]
  ],
  ai: [
    ["model-api", "Bedrock|Lambda|API Gateway", "best for managed foundation model apps", "aws-axi services --capability ai"],
    ["custom-ml", "SageMaker|S3|IAM", "best for custom training or inference", "aws-axi services --capability ai"],
    ["ai-backend", "Lambda|ECS/Fargate|Secrets Manager", "best for app-specific AI services", "aws-axi discover"]
  ],
  fullstack: [
    ["serverless-fullstack", "S3|CloudFront|Lambda|API Gateway|DynamoDB|Cognito", "best for lean fullstack apps", "aws-axi discover"],
    ["container-fullstack", "CloudFront|ECS/Fargate|ELB|Auto Scaling|RDS", "best for container apps with SQL", "aws-axi services --capability traffic-scaling"],
    ["managed-fullstack", "Amplify|App Runner|RDS|Cognito", "best for fastest production path", "aws-axi services --capability easy-hosting"]
  ]
};

main();

function main() {
  const commandInfo = resolveCommand(process.argv.slice(2));
  const config = COMMANDS[commandInfo.command];
  if (!config) {
    usageError(`unknown command ${toonScalar(commandInfo.command)}`, ["Run `aws-axi --help` for available commands"]);
  }

  const parsed = parseArgs(commandInfo.command, commandInfo.args, config);
  if (parsed.flags.help) {
    print(config.help());
    return;
  }

  const context = buildContext(parsed.flags);
  const handlers = {
    home,
    doctor,
    services,
    discover,
    recommend,
    plan,
    apply,
    status,
    logs,
    "hooks install": hooksInstall,
    "skill generate": skillGenerate
  };

  handlers[commandInfo.command](parsed, context);
}

function resolveCommand(args) {
  if (args.length === 0 || args[0].startsWith("--")) return { command: "home", args };
  if ((args[0] === "hooks" || args[0] === "skill") && args[1] && !args[1].startsWith("--")) {
    return { command: `${args[0]} ${args[1]}`, args: args.slice(2) };
  }
  if (args[0] === "hooks" || args[0] === "skill") {
    return { command: args[0], args: args.slice(1) };
  }
  return { command: args[0], args: args.slice(1) };
}

function parseArgs(command, args, config) {
  const valueFlags = new Set([...GLOBAL_VALUE_FLAGS, ...config.value]);
  const booleanFlags = new Set([...GLOBAL_BOOLEAN_FLAGS, ...config.boolean]);
  const flags = {};
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [rawName, inlineValue] = arg.split("=", 2);
    if (!valueFlags.has(rawName) && !booleanFlags.has(rawName)) {
      usageError(`unknown flag ${rawName} for \`${command}\``, [
        `valid flags for \`${command}\`: ${validFlags(valueFlags, booleanFlags)}`
      ]);
    }

    if (booleanFlags.has(rawName)) {
      if (inlineValue !== undefined) {
        usageError(`${rawName} does not take a value`, [`Run \`aws-axi ${command} --help\` for examples`]);
      }
      flags[flagName(rawName)] = true;
      continue;
    }

    const value = inlineValue ?? args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      usageError(`${rawName} requires a value`, [`Run \`aws-axi ${command} --help\` for examples`]);
    }
    flags[flagName(rawName)] = value;
    if (inlineValue === undefined) index += 1;
  }

  if (positional.length > 0) {
    usageError(`unexpected argument ${toonScalar(positional[0])} for \`${command}\``, [
      `Run \`aws-axi ${command} --help\` for examples`
    ]);
  }

  return { flags, positional };
}

function validFlags(valueFlags, booleanFlags) {
  return [...new Set([...valueFlags, ...booleanFlags])].sort().join(", ");
}

function flagName(rawName) {
  return rawName.slice(2).replaceAll("-", "_");
}

function buildContext(flags) {
  const cwd = path.resolve(flags.cwd ?? process.cwd());
  return {
    cwd,
    profile: flags.profile,
    region: flags.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? ""
  };
}

function home(_parsed, context) {
  const identity = getIdentity(context);
  const targets = discoverTargets(context);
  const rows = targets.slice(0, 8).map((target) => ({
    id: target.id,
    type: target.type,
    service: target.service,
    source: displayPath(target.path, context.cwd)
  }));
  const lines = [
    `bin: ${toonScalar(collapseHome(process.argv[1]))}`,
    `description: ${toonScalar(DESCRIPTION)}`,
    `version: ${VERSION}`,
    "aws:",
    `  status: ${toonScalar(identity.status)}`,
    `  account: ${toonScalar(identity.account ?? "")}`,
    `  region: ${toonScalar(context.region || "not-set")}`,
    `  profile: ${toonScalar(context.profile ?? "default")}`,
    `targets_count: ${targets.length}`
  ];

  if (rows.length === 0) {
    lines.push("targets: 0 deployable AWS targets detected in this workspace");
  } else {
    lines.push(formatTable("targets", rows, ["id", "type", "service", "source"]));
  }

  const help = ["Run `aws-axi doctor` to check AWS readiness", "Run `aws-axi discover --full` to inspect detected architecture"];
  if (targets.length > 0) help.push("Run `aws-axi plan --target <id> --environment <name>` before applying changes");
  else help.push("Run `aws-axi recommend --goal fullstack` to choose a hosting path");
  lines.push(formatHelp(help));
  print(lines.join("\n"));
}

function doctor(_parsed, context) {
  const awsPath = findExecutable("aws");
  const identity = getIdentity(context);
  const rows = [
    { check: "aws-cli", status: awsPath ? "ok" : "missing", detail: awsPath ? collapseHome(awsPath) : "install AWS CLI" },
    { check: "credentials", status: identity.status === "ok" ? "ok" : "error", detail: identity.status === "ok" ? identity.account : identity.message },
    { check: "region", status: context.region ? "ok" : "missing", detail: context.region || "set --region or AWS_REGION" },
    { check: "cdk", status: findExecutable("cdk") ? "available" : "missing", detail: "needed only for CDK targets" },
    { check: "sam", status: findExecutable("sam") ? "available" : "missing", detail: "needed only for SAM targets" },
    { check: "terraform", status: findExecutable("terraform") ? "available" : "missing", detail: "needed only for Terraform targets" }
  ];

  print([
    `summary: ${identity.status === "ok" && context.region ? "ready" : "attention-required"}`,
    formatTable("checks", rows, ["check", "status", "detail"]),
    formatHelp(["Run `aws-axi discover` to list deployable targets", "Run `aws-axi services` to inspect supported AWS service domains"])
  ].join("\n"));
}

function services(parsed) {
  const fields = parseFields(parsed.flags.fields, ["capability", "services", "use"], ["capability", "services", "use"]);
  const rows = SERVICE_DOMAINS
    .filter((row) => !parsed.flags.capability || row.capability === parsed.flags.capability)
    .map((row) => pick(row, fields));

  const lines = [`count: ${rows.length} of ${SERVICE_DOMAINS.length} service domains`];
  if (rows.length === 0) lines.push(`services: 0 service domains found for ${toonScalar(parsed.flags.capability)}`);
  else lines.push(formatTable("services", rows, fields));
  lines.push(formatHelp(["Run `aws-axi recommend --goal <website|api|database|ai|fullstack>` for service paths"]));
  print(lines.join("\n"));
}

function discover(parsed, context) {
  const fields = parseFields(parsed.flags.fields, ["id", "type", "service", "path"], ["id", "type", "service", "path", "tool", "environment", "reason"]);
  const targets = discoverTargets(context);
  const rows = targets.map((target) => {
    const row = { ...target, path: displayPath(target.path, context.cwd) };
    if (!parsed.flags.full) row.reason = truncate(row.reason ?? "", 140).text;
    return pick(row, fields);
  });

  const lines = [`count: ${rows.length} targets detected`];
  if (rows.length === 0) lines.push("targets: 0 deployable AWS targets detected in this workspace");
  else lines.push(formatTable("targets", rows, fields));
  lines.push(formatHelp([
    "Run `aws-axi plan --target <id> --environment <name>` before applying changes",
    "Run `aws-axi recommend --goal fullstack` if no target matches the app"
  ]));
  print(lines.join("\n"));
}

function recommend(parsed) {
  const goal = parsed.flags.goal;
  if (!goal) usageError("--goal is required", ["Run `aws-axi recommend --goal <website|api|database|ai|fullstack>`"]);
  const rows = RECOMMENDATIONS[goal];
  if (!rows) {
    usageError(`unknown goal ${toonScalar(goal)}`, ["valid goals: website, api, database, ai, fullstack"]);
  }
  print([
    `goal: ${goal}`,
    formatTable("paths", rows.map(([id, servicesValue, fit, command]) => ({ id, services: servicesValue, fit, command })), ["id", "services", "fit", "command"]),
    formatHelp(["Run the suggested command for the path that best matches the app"])
  ].join("\n"));
}

function plan(parsed, context) {
  const target = requireTarget(parsed, context);
  const environment = requireEnvironment(parsed);
  const result = buildPlan(target, environment, parsed.flags, context);
  print(result);
}

function apply(parsed, context) {
  const target = requireTarget(parsed, context);
  const environment = requireEnvironment(parsed);
  const planText = buildPlan(target, environment, parsed.flags, context, { forApply: true });

  if (!parsed.flags.execute) {
    print([
      "apply:",
      "  dry_run: true",
      `  target: ${toonScalar(target.id)}`,
      `  environment: ${toonScalar(environment)}`,
      planText,
      formatHelp([`Run \`aws-axi apply --target ${target.id} --environment ${environment} --execute\` to execute after review`])
    ].join("\n"));
    return;
  }

  const identity = getIdentity(context);
  if (identity.status !== "ok") {
    runtimeError("aws identity could not be verified", [identity.help ?? "Run `aws-axi doctor` to fix AWS credentials"]);
  }
  if (environment === "production" && parsed.flags.confirm_account !== identity.account) {
    usageError("production apply requires --confirm-account matching the active AWS account", [
      `Run \`aws-axi apply --target ${target.id} --environment production --execute --confirm-account ${identity.account}\``
    ]);
  }

  const command = deployCommand(target, environment, parsed.flags);
  if (!command) {
    runtimeError(`target ${toonScalar(target.id)} does not have an executable apply command`, [
      "Add aws-axi.config.json commands.deploy or use an IaC target with a supported deploy command"
    ]);
  }
  ensureTool(command.cmd, target.type);
  const result = runCommand(command.cmd, command.args, commandContext(command, context));
  if (result.status !== 0) {
    runtimeError(`${target.type} apply failed`, [sanitize(result.stderr || result.stdout || "run `aws-axi doctor` and retry")]);
  }

  print([
    "apply:",
    "  dry_run: false",
    `  target: ${toonScalar(target.id)}`,
    `  environment: ${toonScalar(environment)}`,
    `  command: ${toonScalar(formatCommand(command))}`,
    `  output: ${toonScalar(truncate(sanitize(result.stdout), PREVIEW_LIMIT).text)}`
  ].join("\n"));
}

function status(parsed, context) {
  const targets = discoverTargets(context);
  const target = parsed.flags.target ? targets.find((item) => item.id === parsed.flags.target) : undefined;
  if (parsed.flags.target && !target) {
    usageError(`target ${toonScalar(parsed.flags.target)} was not found`, ["Run `aws-axi discover` to find target ids"]);
  }

  const identity = getIdentity(context);
  const lines = [
    "status:",
    `  aws: ${toonScalar(identity.status)}`,
    `  account: ${toonScalar(identity.account ?? "")}`,
    `  region: ${toonScalar(context.region || "not-set")}`
  ];

  if (target?.type === "cloudformation" && parsed.flags.stack_name) {
    ensureTool("aws", "cloudformation");
    const result = runCommand("aws", ["cloudformation", "describe-stacks", "--stack-name", parsed.flags.stack_name, "--output", "json"], context);
    if (result.status !== 0) runtimeError("cloudformation status failed", [sanitize(result.stderr || result.stdout)]);
    const parsedStack = parseJson(result.stdout);
    const stack = parsedStack?.Stacks?.[0] ?? {};
    lines.push("stack:");
    lines.push(`  name: ${toonScalar(stack.StackName ?? parsed.flags.stack_name)}`);
    lines.push(`  state: ${toonScalar(stack.StackStatus ?? "unknown")}`);
  } else {
    const rows = (target ? [target] : targets).slice(0, 20).map((item) => ({
      id: item.id,
      type: item.type,
      service: item.service,
      state: "detected"
    }));
    if (rows.length === 0) lines.push("targets: 0 targets detected in this workspace");
    else lines.push(formatTable("targets", rows, ["id", "type", "service", "state"]));
  }

  lines.push(formatHelp(["Run `aws-axi logs --target <id> --log-group <name>` for CloudWatch logs"]));
  print(lines.join("\n"));
}

function logs(parsed, context) {
  const logGroup = parsed.flags.log_group;
  if (!logGroup) {
    usageError("--log-group is required", ["Run `aws-axi logs --log-group <cloudwatch-log-group> [--limit 20]`"]);
  }
  ensureTool("aws", "cloudwatch logs");
  const limit = parsePositiveInteger(parsed.flags.limit ?? "20", "--limit");
  const result = runCommand("aws", ["logs", "filter-log-events", "--log-group-name", logGroup, "--limit", String(limit), "--output", "json"], context);
  if (result.status !== 0) runtimeError("cloudwatch logs query failed", [sanitize(result.stderr || result.stdout)]);
  const events = parseJson(result.stdout)?.events ?? [];
  const rows = events.map((event) => ({
    time: event.timestamp ?? "",
    stream: event.logStreamName ?? "",
    message: parsed.flags.full ? event.message ?? "" : truncate(event.message ?? "", 220).text
  }));
  const lines = [`count: ${rows.length} log events`];
  if (rows.length === 0) lines.push(`logs: 0 events found for ${toonScalar(logGroup)}`);
  else lines.push(formatTable("events", rows, ["time", "stream", "message"]));
  print(lines.join("\n"));
}

function hooksInstall(parsed, context) {
  const agent = parsed.flags.agent ?? "all";
  const scope = parsed.flags.scope ?? "project";
  const validAgents = new Set(["codex", "claude", "opencode", "all"]);
  const validScopes = new Set(["user", "project"]);
  if (!validAgents.has(agent)) usageError(`unknown agent ${toonScalar(agent)}`, ["valid agents: codex, claude, opencode, all"]);
  if (!validScopes.has(scope)) usageError(`unknown scope ${toonScalar(scope)}`, ["valid scopes: user, project"]);

  const rows = hookTargets(agent, scope, context);
  if (!parsed.flags.execute) {
    print([
      "hooks:",
      "  dry_run: true",
      formatTable("files", rows, ["agent", "path", "status"]),
      formatHelp(["Run `aws-axi hooks install --agent all --scope project --execute` to write hook files"])
    ].join("\n"));
    return;
  }

  for (const row of rows) {
    fs.mkdirSync(path.dirname(row.absolutePath), { recursive: true });
    fs.writeFileSync(row.absolutePath, hookContent(row.agent), "utf8");
  }
  print(formatTable("files", rows.map(({ agent: rowAgent, path: rowPath }) => ({ agent: rowAgent, path: rowPath, status: "written" })), ["agent", "path", "status"]));
}

function skillGenerate(parsed, context) {
  const output = path.resolve(context.cwd, parsed.flags.output ?? "SKILL.md");
  const content = skillContent();
  if (parsed.flags.check) {
    const actual = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
    if (actual !== content) {
      runtimeError("generated skill is stale or missing", [`Run \`aws-axi skill generate --output ${displayPath(output, context.cwd)}\``], 1);
    }
    print("skill: up-to-date");
    return;
  }
  fs.writeFileSync(output, content, "utf8");
  print([
    "skill:",
    `  path: ${toonScalar(displayPath(output, context.cwd))}`,
    "  status: written"
  ].join("\n"));
}

function requireTarget(parsed, context) {
  const id = parsed.flags.target;
  if (!id) usageError("--target is required", ["Run `aws-axi discover` to find target ids"]);
  const target = discoverTargets(context).find((item) => item.id === id);
  if (!target) usageError(`target ${toonScalar(id)} was not found`, ["Run `aws-axi discover` to find target ids"]);
  return target;
}

function requireEnvironment(parsed) {
  const environment = parsed.flags.environment;
  if (!environment) usageError("--environment is required", ["Run `aws-axi plan --target <id> --environment <name>`"]);
  return environment;
}

function buildPlan(target, environment, flags, context, options = {}) {
  const command = planCommand(target, environment, flags);
  const rows = [
    { check: "target", status: "ok", detail: target.id },
    { check: "environment", status: "ok", detail: environment },
    { check: "tool", status: command && findExecutable(command.cmd) ? "ok" : command ? "missing" : "manual", detail: command?.cmd ?? "no command" }
  ];
  const identity = getIdentity(context);
  rows.push({ check: "aws-identity", status: identity.status, detail: identity.account ?? identity.message });

  if (command?.cmd && !findExecutable(command.cmd)) {
    const text = [
      "plan:",
      `  target: ${toonScalar(target.id)}`,
      `  environment: ${toonScalar(environment)}`,
      `  executable: ${toonScalar(command.cmd)}`,
      formatTable("checks", rows, ["check", "status", "detail"]),
      formatHelp([`Install ${command.cmd} or choose another target`])
    ].join("\n");
    if (options.forApply) return indentBlock(text, 0);
    runtimeError(`${command.cmd} is required for ${target.type} target`, [`Install ${command.cmd} or choose another target`]);
  }

  const lines = [
    "plan:",
    `  target: ${toonScalar(target.id)}`,
    `  type: ${toonScalar(target.type)}`,
    `  service: ${toonScalar(target.service)}`,
    `  environment: ${toonScalar(environment)}`,
    `  command: ${toonScalar(command ? formatCommand(command) : "manual review required")}`,
    formatTable("checks", rows, ["check", "status", "detail"])
  ];

  if (command && !options.forApply) {
    const result = runPlanPreview(command, context);
    lines.push("preview:");
    lines.push(`  status: ${toonScalar(result.status === 0 ? "ok" : "error")}`);
    lines.push(`  output: ${toonScalar(flags.full ? sanitize(result.output) : truncate(sanitize(result.output), PREVIEW_LIMIT).text)}`);
  }
  if (!options.forApply) lines.push(formatHelp([`Run \`aws-axi apply --target ${target.id} --environment ${environment}\` to see the guarded apply command`]));
  return lines.join("\n");
}

function runPlanPreview(command, context) {
  const result = runCommand(command.cmd, command.args, commandContext(command, context));
  return {
    status: result.status,
    output: result.stdout || result.stderr || ""
  };
}

function commandContext(command, context) {
  return command.cwd ? { ...context, cwd: command.cwd } : context;
}

function planCommand(target, environment, flags) {
  if (target.commands?.plan) return expandCommand(target.commands.plan, environment);
  if (target.type === "cloudformation") {
    return { cmd: "aws", args: ["cloudformation", "validate-template", "--template-body", `file://${target.path}`] };
  }
  if (target.type === "sam") return { cmd: "sam", args: ["validate", "--template-file", target.path] };
  if (target.type === "cdk") return { cmd: "cdk", args: ["diff", "--app", target.path] };
  if (target.type === "terraform") return { cmd: "terraform", args: ["plan", "-input=false", "-no-color"], cwd: target.path };
  if (target.type === "static-site") {
    return { cmd: "aws", args: ["s3", "ls"] };
  }
  return flags.stack_name ? { cmd: "aws", args: ["cloudformation", "describe-stacks", "--stack-name", flags.stack_name] } : null;
}

function deployCommand(target, environment, flags) {
  if (target.commands?.deploy) return expandCommand(target.commands.deploy, environment);
  if (target.type === "cloudformation") {
    if (!flags.stack_name) usageError("--stack-name is required for CloudFormation apply", ["Run `aws-axi apply --target <id> --environment <name> --stack-name <name> --execute`"]);
    return {
      cmd: "aws",
      args: ["cloudformation", "deploy", "--template-file", target.path, "--stack-name", flags.stack_name, "--no-fail-on-empty-changeset"]
    };
  }
  if (target.type === "sam") return { cmd: "sam", args: ["deploy", "--no-confirm-changeset", "--no-progressbar"] };
  if (target.type === "cdk") return { cmd: "cdk", args: ["deploy", "--require-approval", "never"] };
  if (target.type === "terraform") return { cmd: "terraform", args: ["apply", "-input=false", "-auto-approve", "-no-color"], cwd: target.path };
  return null;
}

function expandCommand(command, environment) {
  const [cmd, ...args] = command.map((part) => String(part).replaceAll("${environment}", environment));
  return { cmd, args };
}

function discoverTargets(context) {
  const targets = [];
  targets.push(...customTargets(context));
  const cdk = path.join(context.cwd, "cdk.json");
  if (fs.existsSync(cdk)) {
    targets.push({ id: "cdk:app", type: "cdk", service: "CloudFormation", path: cdk, tool: "cdk", environment: "any", reason: "cdk.json found" });
  }
  const templates = ["template.yaml", "template.yml", "cloudformation.yaml", "cloudformation.yml"].map((name) => path.join(context.cwd, name));
  for (const template of templates.filter((file) => fs.existsSync(file))) {
    const content = safeRead(template);
    const isSam = /Transform:\s*AWS::Serverless|AWS::Serverless::/i.test(content);
    targets.push({
      id: `${isSam ? "sam" : "cloudformation"}:${path.basename(template)}`,
      type: isSam ? "sam" : "cloudformation",
      service: isSam ? "Lambda/API Gateway" : "CloudFormation",
      path: template,
      tool: isSam ? "sam" : "aws",
      environment: "any",
      reason: `${isSam ? "SAM" : "CloudFormation"} template found`
    });
  }
  if (findFiles(context.cwd, (file) => file.endsWith(".tf"), 2).length > 0) {
    targets.push({ id: "terraform:root", type: "terraform", service: "AWS via Terraform", path: context.cwd, tool: "terraform", environment: "any", reason: "Terraform files found" });
  }
  const packageJson = readJson(path.join(context.cwd, "package.json"));
  if (packageJson) {
    const deps = Object.keys({ ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) }).join(" ");
    const scripts = Object.keys(packageJson.scripts ?? {}).join(" ");
    if (/vite|next|react|vue|svelte|astro/i.test(`${deps} ${scripts}`) || packageJson.scripts?.build) {
      targets.push({ id: "static-site", type: "static-site", service: "S3/CloudFront|Amplify", path: path.join(context.cwd, "package.json"), tool: "aws", environment: "any", reason: "frontend package build detected" });
    }
    if (/server|start|api/i.test(scripts) || /express|fastify|hono|nestjs/i.test(deps)) {
      targets.push({ id: "app-runner", type: "managed-service", service: "App Runner|ECS/Fargate", path: path.join(context.cwd, "package.json"), tool: "aws", environment: "any", reason: "backend package scripts or dependencies detected" });
    }
  }
  return dedupeTargets(targets);
}

function customTargets(context) {
  const file = path.join(context.cwd, "aws-axi.config.json");
  const config = readJson(file);
  if (!config?.targets || !Array.isArray(config.targets)) return [];
  return config.targets.map((target) => ({
    id: String(target.id),
    type: target.type ?? "custom",
    service: target.service ?? "custom AWS workflow",
    path: path.resolve(context.cwd, target.path ?? "."),
    tool: target.tool ?? "custom",
    environment: Object.keys(target.environments ?? {}).join("|") || "any",
    reason: target.reason ?? "aws-axi.config.json target",
    commands: target.commands
  }));
}

function dedupeTargets(targets) {
  const seen = new Set();
  return targets.filter((target) => {
    if (seen.has(target.id)) return false;
    seen.add(target.id);
    return true;
  });
}

function findFiles(root, predicate, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...findFiles(full, predicate, maxDepth, depth + 1));
    else if (predicate(full)) files.push(full);
  }
  return files;
}

function getIdentity(context) {
  if (!findExecutable("aws")) {
    return { status: "missing", message: "aws cli not found", help: "Install AWS CLI and retry" };
  }
  const result = runCommand("aws", ["sts", "get-caller-identity", "--output", "json"], context);
  if (result.status !== 0) {
    return {
      status: "error",
      message: truncate(sanitize(result.stderr || result.stdout || "credentials unavailable"), 160).text,
      help: "Run `aws configure sso` or set AWS credentials"
    };
  }
  const identity = parseJson(result.stdout);
  return {
    status: "ok",
    account: identity?.Account ?? "",
    arn: identity?.Arn ?? "",
    userId: identity?.UserId ?? ""
  };
}

function runCommand(cmd, args, context) {
  const env = { ...process.env };
  if (context.profile) env.AWS_PROFILE = context.profile;
  if (context.region) {
    env.AWS_REGION = context.region;
    env.AWS_DEFAULT_REGION = context.region;
  }
  const result = spawnSync(cmd, args, {
    cwd: context.cwd,
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });
  if (result.error) {
    return { status: 127, stdout: "", stderr: result.error.message };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function ensureTool(cmd, targetType) {
  if (!findExecutable(cmd)) runtimeError(`${cmd} is required for ${targetType}`, [`Install ${cmd} and retry`]);
}

function findExecutable(name) {
  if (name.includes(path.sep)) return fs.existsSync(name) ? name : "";
  const paths = (process.env.PATH ?? "").split(path.delimiter);
  for (const dir of paths) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return "";
}

function parseFields(value, defaults, allowed) {
  if (!value) return defaults;
  const fields = value.split(",").map((field) => field.trim()).filter(Boolean);
  const unknown = fields.find((field) => !allowed.includes(field));
  if (unknown) usageError(`unknown field ${toonScalar(unknown)}`, [`valid fields: ${allowed.join(", ")}`]);
  return fields.length > 0 ? fields : defaults;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) usageError(`${flag} must be a positive integer`, [`Run \`aws-axi logs ${flag} 20\``]);
  return parsed;
}

function pick(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? ""]));
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    usageError(`${displayPath(file, process.cwd())} is not valid JSON`, [`Repair ${displayPath(file, process.cwd())} and retry`], 1);
  }
}

function safeRead(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function truncate(value, limit) {
  const text = String(value ?? "");
  if (text.length <= limit) return { text, truncated: false, total: text.length };
  return { text: `${text.slice(0, limit)}... (truncated, ${text.length} chars total)`, truncated: true, total: text.length };
}

function sanitize(value) {
  return String(value ?? "")
    .replace(/(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|SECRET|TOKEN|PASSWORD)=\S+/gi, "$1=<redacted>")
    .replace(/(aws_secret_access_key|aws_session_token)\s*=\s*\S+/gi, "$1=<redacted>")
    .trim();
}

function formatCommand(command) {
  return [command.cmd, ...command.args].join(" ");
}

function formatTable(name, rows, fields) {
  const header = `${name}[${rows.length}]{${fields.join(",")}}:`;
  return [header, ...rows.map((row) => `  ${fields.map((field) => toonScalar(row[field])).join(",")}`)].join("\n");
}

function formatHelp(items) {
  return [`help[${items.length}]:`, ...items.map((item) => `  ${item}`)].join("\n");
}

function toonScalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  const text = String(value);
  if (text === "") return "\"\"";
  const mustQuote = /[,\[\]{}:"#\n\r\t|]|^\s|\s$/.test(text);
  if (!mustQuote) return text;
  return `"${text.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t")}"`;
}

function collapseHome(filePath) {
  const home = os.homedir();
  return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath;
}

function displayPath(filePath, cwd) {
  const relative = path.relative(cwd, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
  return collapseHome(filePath);
}

function indentBlock(value, spaces) {
  const pad = " ".repeat(spaces);
  return value.split("\n").map((line) => `${pad}${line}`).join("\n");
}

function hookTargets(agent, scope, context) {
  const selected = agent === "all" ? ["codex", "claude", "opencode"] : [agent];
  return selected.map((item) => {
    const absolutePath = hookPath(item, scope, context);
    return { agent: item, path: displayPath(absolutePath, context.cwd), absolutePath, status: fs.existsSync(absolutePath) ? "repair" : "create" };
  });
}

function hookPath(agent, scope, context) {
  if (agent === "codex") return scope === "project" ? path.join(context.cwd, ".codex", "hooks.json") : path.join(os.homedir(), ".codex", "hooks.json");
  if (agent === "claude") return scope === "project" ? path.join(context.cwd, ".claude", "settings.json") : path.join(os.homedir(), ".claude", "settings.json");
  return scope === "project" ? path.join(context.cwd, ".opencode", "aws-axi.json") : path.join(os.homedir(), ".config", "opencode", "plugins", "aws-axi.json");
}

function hookContent(agent) {
  const command = hookCommand();
  if (agent === "codex") {
    return `${JSON.stringify({ SessionStart: [{ command: `${command}` }] }, null, 2)}\n`;
  }
  if (agent === "claude") {
    return `${JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command }] }] } }, null, 2)}\n`;
  }
  return `${JSON.stringify({ name: "aws-axi", command }, null, 2)}\n`;
}

function hookCommand() {
  const installed = findExecutable("aws-axi");
  if (installed && path.resolve(installed) === path.resolve(process.argv[1])) return "aws-axi";
  return `${process.execPath} ${process.argv[1]}`;
}

function skillContent() {
  return `---\nname: aws-axi\ndescription: Use aws-axi to discover, plan, provision, deploy, inspect, and troubleshoot AWS hosting, backend, database, and AI workloads through safe TOON CLI workflows.\n---\n\n# aws-axi\n\nUse \`aws-axi\` when a task involves AWS architecture, hosting, deployments, service recommendations, infrastructure status, CloudWatch logs, or production safety checks.\n\nRun \`aws-axi\` for live context. Use \`aws-axi doctor\` before production work. Plan before applying: \`aws-axi plan --target <id> --environment <name>\`. Mutations require \`--execute\`; production also requires \`--confirm-account <account-id>\`.\n`;
}

function usageError(message, help, code = 2) {
  print([`error: ${message}`, formatHelp(help)].join("\n"));
  process.exit(code);
}

function runtimeError(message, help, code = 1) {
  print([`error: ${message}`, formatHelp(help)].join("\n"));
  process.exit(code);
}

function print(value) {
  process.stdout.write(value);
}

function helpHome() {
  return [
    `bin: ${toonScalar(collapseHome(process.argv[1]))}`,
    `description: ${toonScalar(DESCRIPTION)}`,
    "commands[10]{name,description}:",
    "  doctor,Check AWS credentials region account and tool readiness",
    "  services,List supported AWS service domains",
    "  discover,Detect AWS deployable targets in the current repo",
    "  recommend,Suggest AWS hosting paths for a goal",
    "  plan,Run non-mutating preflight for a target",
    "  apply,Apply a target with explicit execution guards",
    "  status,Summarize AWS or target state",
    "  logs,Read CloudWatch logs",
    "  hooks install,Install session context hooks",
    "  skill generate,Generate installable Agent Skill guidance",
    "examples[3]:",
    "  aws-axi",
    "  aws-axi recommend --goal fullstack",
    "  aws-axi plan --target <id> --environment production"
  ].join("\n");
}

function helpDoctor() {
  return helpUsage("aws-axi doctor", "Check AWS CLI credentials account region and optional IaC tools");
}

function helpServices() {
  return helpUsage("aws-axi services [--capability <name>] [--fields <csv>]", "List AWS service domains supported by aws-axi");
}

function helpDiscover() {
  return helpUsage("aws-axi discover [--fields <csv>] [--full]", "Detect AWS/IaC/frontend/backend targets in the current repo");
}

function helpRecommend() {
  return helpUsage("aws-axi recommend --goal <website|api|database|ai|fullstack>", "Suggest AWS service paths for an app goal");
}

function helpPlan() {
  return helpUsage("aws-axi plan --target <id> --environment <name> [--full]", "Run non-mutating preflight and plan preview");
}

function helpApply() {
  return helpUsage("aws-axi apply --target <id> --environment <name> [--execute] [--confirm-account <id>]", "Apply changes only when explicit execution guards pass");
}

function helpStatus() {
  return helpUsage("aws-axi status [--target <id>] [--stack-name <name>]", "Summarize detected target or CloudFormation stack state");
}

function helpLogs() {
  return helpUsage("aws-axi logs --log-group <name> [--limit <n>] [--full]", "Read recent CloudWatch log events");
}

function helpHooksInstall() {
  return helpUsage("aws-axi hooks install [--agent codex|claude|opencode|all] [--scope user|project] [--execute]", "Install or preview session hooks");
}

function helpSkillGenerate() {
  return helpUsage("aws-axi skill generate [--output SKILL.md] [--check]", "Generate or verify installable Agent Skill guidance");
}

function helpUsage(usage, description) {
  return [
    `usage: ${usage}`,
    `description: ${description}`,
    "global_flags[4]{name,default,description}:",
    "  --profile,\"\",AWS profile",
    "  --region,\"\",AWS region",
    "  --cwd,\".\",Workspace root",
    "  --help,false,Show this help",
    "examples[2]:",
    `  ${usage.replace(/\s?\[.*?\]/g, "").replace(/<[^>]+>/g, "example")}`,
    "  aws-axi doctor --profile prod --region us-east-1"
  ].join("\n");
}
