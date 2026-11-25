const SEPARATOR = " ";

export function idsAttribute(ids: readonly number[]): string {
  return ids.join(SEPARATOR);
}

export function highlightIds(attribute: string): number[] {
  return attribute.split(SEPARATOR).map(Number);
}

export function markIds(mark: HTMLElement): number[] {
  return highlightIds(mark.dataset["highlights"] ?? "");
}

export function markSelector(id: number): string {
  return `mark[data-highlights~="${id}"]`;
}
