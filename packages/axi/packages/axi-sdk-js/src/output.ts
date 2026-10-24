import { homedir } from "node:os";
import { encode } from "@toon-format/toon";

export type AxiStructuredOutput = Record<string, unknown>;
export type AxiRenderable = string | AxiStructuredOutput;

export function collapseHomeDirectory(
  path: string,
  homeDir = homedir(),
): string {
  if (!path.startsWith(homeDir)) {
    return path;
  }

  return `~${path.slice(homeDir.length)}`;
}

export function homeHeaderOutput(options: {
  description: string;
  execPath?: string;
  homeDir?: string;
}): AxiStructuredOutput {
  return {
    bin: collapseHomeDirectory(
      options.execPath ?? process.argv[1] ?? "",
      options.homeDir,
    ),
    description: options.description,
  };
}

export function errorOutput(
  message: string,
  code: string,
  suggestions: string[] = [],
): AxiStructuredOutput {
  const output: AxiStructuredOutput = {
    error: message,
    code,
  };

  if (suggestions.length > 0) {
    output.help = suggestions;
  }

  return output;
}

export function mergeOutput(
  ...parts: Array<AxiStructuredOutput | undefined>
): AxiStructuredOutput {
  return Object.assign({}, ...parts.filter(Boolean));
}

export function renderOutput(output: AxiRenderable): string {
  if (typeof output === "string") {
    return output;
  }

  return encode(output);
}

export function renderError(
  message: string,
  code: string,
  suggestions: string[] = [],
): string {
  return renderOutput(errorOutput(message, code, suggestions));
}

export function renderHomeHeader(options: {
  description: string;
  execPath?: string;
  homeDir?: string;
}): string {
  return renderOutput(homeHeaderOutput(options));
}
