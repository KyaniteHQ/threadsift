import { caseFold } from "./case-folding.ts";

export const CATALOG_KEY_VERSION = 1;

const DOT_AFTER_I = /i\u0307+/gu;

export function catalogKey(name: string): string {
  return caseFold(name.normalize("NFKC"))
    .replaceAll(DOT_AFTER_I, "i")
    .normalize("NFC")
    .trim()
    .replaceAll(/\s+/gu, " ");
}
