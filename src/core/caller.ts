export type Caller = { readonly kind: "owner" } | { readonly kind: "token"; readonly id: number };

export function tokenIdOf(caller: Readonly<Caller>): number | null {
  return caller.kind === "owner" ? null : caller.id;
}
