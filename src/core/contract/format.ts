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
