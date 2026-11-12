import type { Proposal } from "../../src/core/proposal-contract.ts";

export const ACCEPT_CLASS = "pr-accept";

export const REJECT_CLASS = "pr-reject";

export const REJECT_SELECTOR = `.${REJECT_CLASS}`;

export function rowId(id: number): string {
  return `proposal-${String(id)}`;
}

export function rejectSelectorOf(id: number): string {
  return `#${rowId(id)} ${REJECT_SELECTOR}`;
}

export function sidesId(id: number): string {
  return `${rowId(id)}-sides`;
}

export function reasonId(id: number): string {
  return `${rowId(id)}-reason`;
}

export function rejectDescription(proposal: Readonly<Proposal>): string | undefined {
  return proposal.kind === "items-disagree"
    ? `${sidesId(proposal.id)} ${reasonId(proposal.id)}`
    : undefined;
}
