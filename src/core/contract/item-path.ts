const ITEM_PATH = /^\/items\/(\d+)$/u;

export function itemPath(id: number): string {
  return `/items/${id}`;
}

export function itemIdOf(pathname: string): number | null {
  const match = ITEM_PATH.exec(pathname);

  return match?.[1] === undefined ? null : Number(match[1]);
}
