export type Caller =
  | { readonly kind: "owner" }
  | { readonly kind: "token"; readonly id: number }
  | { readonly kind: "batch"; readonly id: number; readonly day: string };

export interface Counting {
  readonly addedByToken: number | null;
  readonly budgetSlotDay: string | null;
}

const NOT_COUNTED: Counting = { addedByToken: null, budgetSlotDay: null };

export function countedBy(caller: Readonly<Caller>): Counting {
  if (caller.kind === "owner") return NOT_COUNTED;

  return { addedByToken: caller.id, budgetSlotDay: caller.kind === "batch" ? caller.day : null };
}
