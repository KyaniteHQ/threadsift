export const REJECT_CLASS = "pr-reject";

export const REJECT_SELECTOR = `.${REJECT_CLASS}`;

export function rowId(id: number): string {
  return `proposal-${String(id)}`;
}

export function rejectSelectorOf(id: number): string {
  return `#${rowId(id)} ${REJECT_SELECTOR}`;
}
