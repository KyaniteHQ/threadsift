import { CASE_FOLDING_EXPANSIONS, CASE_FOLDING_RUNS } from "./case-folding-table.ts";

function foldings(): ReadonlyMap<string, string> {
  const folded = new Map<string, string>();

  for (const [first, last, step, delta] of CASE_FOLDING_RUNS) {
    for (let codePoint = first; codePoint <= last; codePoint += step) {
      folded.set(String.fromCodePoint(codePoint), String.fromCodePoint(codePoint + delta));
    }
  }

  for (const [codePoint, to] of CASE_FOLDING_EXPANSIONS) {
    folded.set(String.fromCodePoint(codePoint), String.fromCodePoint(...to));
  }

  return folded;
}

const FOLDINGS = foldings();

export function caseFold(text: string): string {
  return Array.from(text, (character) => FOLDINGS.get(character) ?? character).join("");
}
