const WORD = /[\p{L}\p{N}\p{M}]+/gu;

export function searchTerms(typed: string): readonly string[] {
  return [...new Set(typed.toLowerCase().match(WORD) ?? [])];
}
