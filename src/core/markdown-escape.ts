const NOT_PLAIN_YAML = /[\u007F-\u009F\u2028\u2029\uFFFE\uFFFF]/gu;

const INLINE_SPECIALS = /[\\`*_[\]<>&~|]/gu;

const BLOCK_MARKER = /^(\s{0,3})([#>+=-])/u;

const LIST_NUMBER = /^(\s{0,3}\d+)([.)])/u;

function unicodeEscape(character: string): string {
  return "\\u" + (character.codePointAt(0) ?? 0).toString(16).padStart(4, "0");
}

export function yamlScalar(value: string | null): string {
  return JSON.stringify(value ?? "").replaceAll(NOT_PLAIN_YAML, unicodeEscape);
}

export function lineBreaksOf(text: string): string[] {
  return text.split(/\r\n|\r|\n/u);
}

export function plainMarkdown(text: string): string {
  return lineBreaksOf(text)
    .map((line) =>
      line
        .replaceAll(INLINE_SPECIALS, "\\$&")
        .replace(BLOCK_MARKER, "$1\\$2")
        .replace(LIST_NUMBER, "$1\\$2"),
    )
    .join("\n");
}
