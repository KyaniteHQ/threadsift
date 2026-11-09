const SEPARATOR = " ";

export function idsAttribute(ids: readonly number[]): string {
  return ids.join(SEPARATOR);
}

export function highlightIds(attribute: string): number[] {
  return attribute.split(SEPARATOR).map(Number);
}
