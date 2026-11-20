import { CanonicalNumberTextSchema } from "./canonical-number.ts";

const ITEM_PATH = /^\/items\/([^/]+)$/u;

export function itemPath(id: number): string {
  return `/items/${id}`;
}

export function itemIdOf(pathname: string): number | null {
  const parsed = CanonicalNumberTextSchema.safeParse(ITEM_PATH.exec(pathname)?.[1]);

  return parsed.success ? parsed.data : null;
}
