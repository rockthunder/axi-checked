> **Vetted copy** of [thatdudealso/aws-axi](https://github.com/thatdudealso/aws-axi) at commit `85f9b4e`. This README is the upstream text; behaviour differs where this repo patched it - see [`SECURITY-REVIEW.md`](../../SECURITY-REVIEW.md) and [`SOURCES.md`](../../SOURCES.md). Original: [thatdudealso/aws-axi README](https://github.com/thatdudealso/aws-axi/blob/85f9b4e35180dc5bfd084e735e3e1a9323e0d8c7/README.md).

# aws-axi

Agent-facing AWS operations AXI for discovering, planning, provisioning,
deploying, inspecting, and troubleshooting AWS services used to host websites,
databases, backends, frontends, and AI workloads.

The project follows the AXI creation guidelines installed with
`npx skills add kunchenguid/axi`.

## Goals

- Show useful live AWS context with `aws-axi`, not help text.
- Use compact TOON-style stdout for agent parsing.
- Keep every command non-interactive.
- Fail loudly on unknown flags before side effects.
- Default to read-only discovery, planning, or dry-run behavior.
- Require `--execute` for mutations.
- Require `--confirm-account <id>` for production mutations.
- Redact credentials and secrets from output.

## Usage

```sh
npm test
node bin/aws-axi.js
node bin/aws-axi.js doctor
node bin/aws-axi.js services
node bin/aws-axi.js discover
node bin/aws-axi.js recommend --goal fullstack
node bin/aws-axi.js plan --target <id> --environment staging
node bin/aws-axi.js apply --target <id> --environment production --execute --confirm-account <account-id>
```

## Service Domains

- Easy hosting paths: Amplify, App Runner, Elastic Beanstalk, Lightsail
- Frontend/web: S3, CloudFront, Route 53, ACM
- Backend/compute: Lambda, API Gateway, ECS/Fargate, ECR, EC2
- Traffic and scaling: Elastic Load Balancing, Auto Scaling, CloudFront
- Auth and identity: Cognito, IAM
- Data: RDS, Aurora, DynamoDB, ElastiCache, S3
- AI: Bedrock, SageMaker, Lambda/API Gateway AI backends
- Operations/secrets: CloudWatch, CloudTrail, Secrets Manager, SSM Parameter Store

## Custom Targets

`aws-axi.config.json` can define architecture-specific workflows:

```json
{
  "targets": [
    {
      "id": "api",
      "type": "custom",
      "service": "ECS/Fargate",
      "path": ".",
      "commands": {
        "plan": ["npm", "run", "deploy:plan", "--", "--env", "${environment}"],
        "deploy": ["npm", "run", "deploy", "--", "--env", "${environment}"]
      }
    }
  ]
}
```

## AXI Catalog Entry

The upstream `kunchenguid/axi` community catalog entry should be:

- AXI: `aws-axi`
- Author: `thatdudealso`
- Domain: `AWS`
- Description: `Discover, plan, provision, deploy, and inspect AWS services for hosting web, backend, database, and AI workloads through safe token-efficient CLI workflows.`
- Link: `https://github.com/thatdudealso/aws-axi`
