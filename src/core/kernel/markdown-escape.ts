import { escapedJson, splitLines } from "../contract/format.ts";

const INLINE_SPECIALS = /[\\`*_[\]<>&~|]/gu;

const BLOCK_MARKER = /^(\s{0,3})([#>+=-])/u;

const LIST_NUMBER = /^(\s{0,3}\d+)([.)])/u;

export function yamlScalar(value: string | null): string {
  return escapedJson(value ?? "");
}

export function escapeInline(text: string): string {
  return text.replaceAll(INLINE_SPECIALS, "\\$&");
}

export function plainMarkdown(text: string): string {
  return splitLines(text)
    .map((line) =>
      escapeInline(line).replace(BLOCK_MARKER, "$1\\$2").replace(LIST_NUMBER, "$1\\$2"),
    )
    .join("\n");
}
