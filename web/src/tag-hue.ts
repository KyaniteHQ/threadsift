const HUES = 8;
const HASH_FACTOR = 31;

export function tagHue(name: string): number {
  const folded = name.normalize("NFKC").toLowerCase();
  let hash = 0;

  for (const char of folded) {
    hash = (Math.imul(hash, HASH_FACTOR) + (char.codePointAt(0) ?? 0)) >>> 0;
  }

  return hash % HUES;
}
