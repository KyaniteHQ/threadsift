export function pixelsOf(value: string): number | null {
  const pixels = Number(value.replace(/px$/u, ""));

  return value === "" || Number.isNaN(pixels) ? null : pixels;
}
