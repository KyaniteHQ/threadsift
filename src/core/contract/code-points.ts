const BASIC_PLANE_END = 0xff_ff;

export function startsPair(text: string, at: number): boolean {
  return (text.codePointAt(at) ?? 0) > BASIC_PLANE_END;
}

export function codePointCount(text: string, end = text.length): number {
  let count = 0;

  for (let at = 0; at < end; at += startsPair(text, at) ? 2 : 1) count += 1;

  return count;
}

export function unitIndexAt(text: string, codePoints: number, from = 0): number | null {
  let at = from;

  for (let seen = 0; seen < codePoints; seen += 1) {
    if (at >= text.length) return null;

    at += startsPair(text, at) ? 2 : 1;
  }

  return at;
}
