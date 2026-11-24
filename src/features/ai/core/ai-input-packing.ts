import { AI_INPUT_BYTES } from "../../../core/contract/ai-contract.ts";

interface PackRule<Packed, Item> {
  readonly add: (packed: Packed, item: Item) => Packed;
  readonly bytes: (packed: Packed) => number;
  readonly stopAtFirstMiss: boolean;
  readonly variants?: (item: Item, packed: Packed) => readonly Item[];
}

function firstFitting<Packed, Item>(
  packed: Packed,
  item: Item,
  { add, bytes, variants = () => [item] }: Readonly<PackRule<Packed, Item>>,
): Packed | null {
  for (const variant of variants(item, packed)) {
    const grown = add(packed, variant);

    if (bytes(grown) <= AI_INPUT_BYTES) return grown;
  }

  return null;
}

export function packWithinInputCap<Packed, Item>(
  start: Packed,
  items: readonly Item[],
  rule: Readonly<PackRule<Packed, Item>>,
): Packed {
  let packed = start;

  for (const item of items) {
    const grown = firstFitting(packed, item, rule);

    if (grown !== null) packed = grown;
    else if (rule.stopAtFirstMiss) break;
  }

  return packed;
}
