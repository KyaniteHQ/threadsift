const GROUPED = new Intl.NumberFormat("en-US");

export function groupedNumber(value: number): string {
  return GROUPED.format(value);
}

const BINARY_UNITS = [
  ["MiB", 1024 * 1024],
  ["KiB", 1024],
] as const;

export function byteSize(bytes: number): string {
  const unit = BINARY_UNITS.find(([, size]) => bytes % size === 0);

  return unit === undefined
    ? `${groupedNumber(bytes)} bytes`
    : `${String(bytes / unit[1])} ${unit[0]}`;
}

export function collapsed(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/u);
}

export type JsonField = number | string | null | readonly number[] | readonly string[];

const UNESCAPED_BY_JSON = /[\u007F-\u009F\u2028\u2029\uFFFE\uFFFF]/gu;

function unicodeEscape(character: string): string {
  return "\\u" + Number(character.codePointAt(0)).toString(16).padStart(4, "0");
}

export function escapedJson(value: string | Readonly<Record<string, JsonField>>): string {
  return JSON.stringify(value).replaceAll(UNESCAPED_BY_JSON, unicodeEscape);
}
