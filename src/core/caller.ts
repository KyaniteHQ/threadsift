export type Caller =
  | { readonly kind: "owner" }
  | { readonly kind: "token"; readonly id: number }
  | { readonly kind: "batch"; readonly id: number };

export function countedToken(caller: Readonly<Caller>): number | null {
  return caller.kind === "token" ? caller.id : null;
}
