import { itemPath } from "../../src/core/item-path.ts";

export type Place = { readonly kind: "highlight"; readonly id: number } | { readonly kind: "note" };

const HIGHLIGHT = "highlight";
const NOTE = "note";

export function placePath(itemId: number, place: Readonly<Place>): string {
  const query = place.kind === "note" ? NOTE : `${HIGHLIGHT}=${String(place.id)}`;

  return `${itemPath(itemId)}?${query}`;
}

export function arrivalPlace(): Place | null {
  const query = new URLSearchParams(window.location.search);
  const id = Number(query.get(HIGHLIGHT));

  if (Number.isSafeInteger(id) && id > 0) return { kind: "highlight", id };

  return query.has(NOTE) ? { kind: "note" } : null;
}
