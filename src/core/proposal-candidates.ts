export const PROPOSALS_MAX = 20;

export interface CandidateTag {
  readonly id: number;
  readonly key: string;
  readonly items: number;
}

export interface CandidatePair {
  readonly low: number;
  readonly high: number;
  readonly weight: number;
}

const NOT_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

const WORD_SEPARATOR = /[^\p{L}\p{N}]+/u;

const MIN_STEM = 3;

const MIN_INITIALISM = 2;

export function looseKey(key: string): string {
  const letters = key.replaceAll(NOT_ALPHANUMERIC, "");
  const characters = Array.from(letters);

  return characters.length - 1 >= MIN_STEM && characters.at(-1) === "s"
    ? characters.slice(0, -1).join("")
    : letters;
}

function initialism(key: string): string | null {
  const words = key.split(WORD_SEPARATOR).filter((word) => word !== "");

  if (words.length < 2) return null;

  return words.map((word) => Array.from(word)[0]).join("");
}

export function pairKey(first: number, second: number): string {
  return first < second
    ? `${String(first)}:${String(second)}`
    : `${String(second)}:${String(first)}`;
}

function orderedPair(first: Readonly<CandidateTag>, second: Readonly<CandidateTag>): CandidatePair {
  const [low, high] = first.id < second.id ? [first, second] : [second, first];

  return { low: low.id, high: high.id, weight: first.items + second.items };
}

function byLooseKey(tags: readonly Readonly<CandidateTag>[]) {
  const groups = new Map<string, CandidateTag[]>();

  for (const tag of tags) {
    const loose = looseKey(tag.key);

    if (loose !== "") groups.set(loose, [...(groups.get(loose) ?? []), tag]);
  }

  return groups;
}

function* sameKeyPairs(groups: Readonly<ReadonlyMap<string, readonly Readonly<CandidateTag>[]>>) {
  for (const group of groups.values()) {
    for (const [index, first] of group.entries()) {
      for (const second of group.slice(index + 1)) yield orderedPair(first, second);
    }
  }
}

function* initialismPairs(
  tags: readonly Readonly<CandidateTag>[],
  groups: Readonly<ReadonlyMap<string, readonly Readonly<CandidateTag>[]>>,
) {
  for (const tag of tags) {
    const letters = initialism(tag.key);

    if (letters !== null && Array.from(letters).length >= MIN_INITIALISM) {
      for (const other of groups.get(letters) ?? []) {
        if (other.id !== tag.id) yield orderedPair(tag, other);
      }
    }
  }
}

function byWeightThenIds(first: Readonly<CandidatePair>, second: Readonly<CandidatePair>): number {
  return second.weight - first.weight || first.low - second.low || first.high - second.high;
}

export function candidatePairs(
  tags: readonly Readonly<CandidateTag>[],
  known: Readonly<ReadonlySet<string>>,
): readonly CandidatePair[] {
  const used = tags.filter(({ items }) => items > 0);
  const groups = byLooseKey(used);
  const found = new Map<string, CandidatePair>();

  for (const pair of [...sameKeyPairs(groups), ...initialismPairs(used, groups)]) {
    const key = pairKey(pair.low, pair.high);

    if (!known.has(key)) found.set(key, pair);
  }

  return [...found.values()].toSorted(byWeightThenIds);
}

export function disjointPairs(
  pairs: readonly Readonly<CandidatePair>[],
  max: number = PROPOSALS_MAX,
): readonly CandidatePair[] {
  const taken = new Set<number>();
  const chosen: CandidatePair[] = [];

  for (const pair of pairs) {
    if (chosen.length < max && !taken.has(pair.low) && !taken.has(pair.high)) {
      taken.add(pair.low);
      taken.add(pair.high);
      chosen.push(pair);
    }
  }

  return chosen;
}
