const WORD =
  /[\p{L}\p{N}\p{Co}][\p{L}\p{N}\p{Co}\u0300-\u0304\u0306-\u030C\u030F\u0311\u031B\u0323-\u0328\u032D\u032E\u0330\u0331]*/gu;

export function searchTerms(typed: string): readonly string[] {
  return [...new Set(typed.toLowerCase().match(WORD) ?? [])];
}
