import type { XReply } from "./x-wire.ts";

export function order<Value extends bigint | number>(first: Value, second: Value): number {
  if (first === second) return 0;

  return first < second ? -1 : 1;
}

export function hasPossibleParent({ id, parentId }: Readonly<XReply>, rootId: string): boolean {
  const parent = BigInt(parentId);

  return parent >= BigInt(rootId) && parent < BigInt(id);
}
