import { caseFold } from "./case-folding.ts";

const DOT_AFTER_I = /i\u0307+/gu;

export function catalogKey(name: string): string {
  return caseFold(name.normalize("NFKC"))
    .replaceAll(DOT_AFTER_I, "i")
    .normalize("NFC")
    .trim()
    .replaceAll(/\s+/gu, " ");
}

export function renamedTags(
  names: readonly string[],
  rename: (key: string) => string | undefined,
): readonly string[] {
  const kept = new Map<string, string>();

  for (const name of names) {
    const renamed = rename(catalogKey(name)) ?? name;
    const key = catalogKey(renamed);

    if (!kept.has(key)) kept.set(key, renamed);
  }

  return [...kept.values()];
}
