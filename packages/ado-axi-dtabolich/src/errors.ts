import { AxiError, exitCodeForError } from "axi-sdk-js";

export { AxiError, exitCodeForError };

/** Strip Azure CLI binary names from agent-facing messages. */
export function scrubTool(message: string): string {
  return message
    .replace(/^ERROR:\s*/i, "")
    .replace(/^az:\s*/i, "")
    .replace(/\baz\b(?!-)/gi, "the CLI")
    .replace(/\bazure-devops\b/gi, "Azure DevOps extension")
    .trim();
}

function extractApiMessage(body: string): string | undefined {
  const msgMatch = body.match(/"message"\s*:\s*"([^"]+)"/);
  if (msgMatch) return scrubTool(msgMatch[1]);
  const typeMatch = body.match(/"typeName"\s*:\s*"([^"]+)"/);
  if (typeMatch) return scrubTool(typeMatch[1]);
  return undefined;
}

function firstErrorLine(stderr: string): string {
  return scrubTool(
    stderr
      .trim()
      .split("\n")
      .find((line) => line.trim().length > 0) ?? "",
  );
}

/** Translate raw Azure CLI stderr into a structured AxiError. */
export function mapAzError(stderr: string, exitCode: number): AxiError {
  if (/TF401019|TF400813|401|unauthorized|not authorized|login|authentication/i.test(stderr)) {
    return new AxiError(
      "Azure DevOps authentication required",
      "AUTH_REQUIRED",
      [
        "Run `az login` (or `az devops login --organization https://dev.azure.com/<org>`) then retry",
        "Ensure the azure-devops extension is installed: `az extension add --name azure-devops`",
      ],
    );
  }
  if (/404|not found|does not exist|TF401019/i.test(stderr)) {
    return new AxiError(
      extractApiMessage(stderr) ?? "Resource not found",
      "NOT_FOUND",
    );
  }
  if (/403|forbidden|access denied|TF401027/i.test(stderr)) {
    return new AxiError(
      extractApiMessage(stderr) ?? "Insufficient permissions for this action",
      "FORBIDDEN",
    );
  }
  if (/409|conflict/i.test(stderr)) {
    return new AxiError(
      extractApiMessage(stderr) ?? "Conflicting request",
      "CONFLICT",
    );
  }
  if (/400|validation|invalid|required parameter/i.test(stderr)) {
    return new AxiError(
      extractApiMessage(stderr) ?? (firstErrorLine(stderr) || "Validation error"),
      "VALIDATION_ERROR",
    );
  }
  const line = firstErrorLine(stderr);
  return new AxiError(
    line || `Request failed with code ${exitCode}`,
    "UNKNOWN",
  );
}

export function azNotInstalledError(): AxiError {
  return new AxiError(
    "Azure CLI is not installed — see https://learn.microsoft.com/cli/azure/install-azure-cli",
    "CLI_NOT_INSTALLED",
    [
      "Install Azure CLI, then `az extension add --name azure-devops`",
      "Authenticate with `az login`",
    ],
  );
}

export function devopsExtensionMissingError(): AxiError {
  return new AxiError(
    "Azure DevOps CLI extension is not installed",
    "CLI_NOT_INSTALLED",
    ["Run `az extension add --name azure-devops`"],
  );
}
