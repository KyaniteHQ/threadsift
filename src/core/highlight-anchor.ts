export const CONTEXT_CODE_POINTS = 32;

export interface Selector {
  readonly exact: string;
  readonly prefix: string;
  readonly suffix: string;
}

export interface PlacedSelector extends Selector {
  readonly hint: number;
}

export type Anchor =
  | { readonly status: "attached"; readonly start: number }
  | { readonly status: "gone" }
  | { readonly status: "ambiguous" };

const BASIC_PLANE_END = 0xff_ff;

function pairAt(text: string, at: number): boolean {
  return (text.codePointAt(at) ?? 0) > BASIC_PLANE_END;
}

export function codePointCount(text: string, end = text.length): number {
  let count = 0;

  for (let at = 0; at < end; at += pairAt(text, at) ? 2 : 1) count += 1;

  return count;
}

export function unitIndexAt(text: string, codePoints: number, from = 0): number | null {
  let at = from;

  for (let seen = 0; seen < codePoints; seen += 1) {
    if (at >= text.length) return null;

    at += pairAt(text, at) ? 2 : 1;
  }

  return at;
}

function contextBefore(text: string, end: number): string {
  const window = text.slice(Math.max(0, end - (2 * CONTEXT_CODE_POINTS + 1)), end);

  return Array.from(window).slice(-CONTEXT_CODE_POINTS).join("");
}

function contextAfter(text: string, from: number): string {
  const window = text.slice(from, from + 2 * CONTEXT_CODE_POINTS);

  return Array.from(window).slice(0, CONTEXT_CODE_POINTS).join("");
}

function commonRun(stored: readonly string[], seen: readonly string[]): number {
  let shared = 0;

  while (shared < stored.length && stored[shared] === seen[shared]) shared += 1;

  return shared;
}

function sharedSuffix(stored: string, text: string, end: number): number {
  return commonRun(
    Array.from(stored).toReversed(),
    Array.from(contextBefore(text, end)).toReversed(),
  );
}

function sharedPrefix(stored: string, text: string, from: number): number {
  return commonRun(Array.from(stored), Array.from(contextAfter(text, from)));
}

function occurrences(text: string, exact: string): number[] {
  const starts: number[] = [];

  for (let at = text.indexOf(exact); at !== -1; at = text.indexOf(exact, at + 1)) starts.push(at);

  return starts;
}

function contextScore(text: string, selector: Readonly<Selector>, start: number): number {
  return (
    sharedSuffix(selector.prefix, text, start) +
    sharedPrefix(selector.suffix, text, start + selector.exact.length)
  );
}

export function anchorIn(text: string, selector: Readonly<Selector>): Anchor {
  const starts = occurrences(text, selector.exact);
  const [only] = starts;

  if (only === undefined) return { status: "gone" };

  if (starts.length === 1) return { status: "attached", start: codePointCount(text, only) };

  const scored = starts.map((start) => ({ start, score: contextScore(text, selector, start) }));
  const best = scored.reduce((most, { score }) => Math.max(most, score), 0);
  const top = scored.filter(({ score }) => score === best);
  const [winner] = top;

  return top.length === 1 && winner !== undefined
    ? { status: "attached", start: codePointCount(text, winner.start) }
    : { status: "ambiguous" };
}

export function selectorHolds(text: string, selector: Readonly<Selector>, start: number): boolean {
  const from = unitIndexAt(text, start);

  if (from === null || !text.startsWith(selector.exact, from)) return false;

  const end = from + selector.exact.length;

  return (
    contextBefore(text, from) === selector.prefix && contextAfter(text, end) === selector.suffix
  );
}

export function selectorAt(text: string, start: number, length: number): PlacedSelector | null {
  const from = unitIndexAt(text, start);
  const end = unitIndexAt(text, start + length);

  if (from === null || end === null) return null;

  return {
    exact: text.slice(from, end),
    prefix: contextBefore(text, from),
    suffix: contextAfter(text, end),
    hint: start,
  };
}
