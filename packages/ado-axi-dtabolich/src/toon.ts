import { encode } from "@toon-format/toon";

export function renderHelp(lines: string[]): string {
  if (lines.length === 0) return "";
  const indented = lines.map((l) => `  ${l}`).join("\n");
  return `help[${lines.length}]:\n${indented}`;
}

export function renderError(
  message: string,
  code: string,
  suggestions: string[] = [],
): string {
  const blocks = [encode({ error: message, code })];
  if (suggestions.length > 0) blocks.push(renderHelp(suggestions));
  return blocks.join("\n");
}

export function renderOutput(blocks: Array<string | undefined | null>): string {
  return blocks.filter(Boolean).join("\n");
}

export function truncateText(
  text: string | undefined | null,
  limit = 800,
): { text: string; truncated: boolean; total: number } {
  const value = text ?? "";
  if (value.length <= limit) {
    return { text: value, truncated: false, total: value.length };
  }
  return {
    text: `${value.slice(0, limit)}\n... (truncated, ${value.length} chars total — use --full)`,
    truncated: true,
    total: value.length,
  };
}
