import type { Proposal } from "../../src/core/contract/proposal-contract.ts";

export const ACCEPT_CLASS = "pr-accept";

export const REJECT_CLASS = "pr-reject";

export const REJECT_SELECTOR = `.${REJECT_CLASS}`;

export function rowId(id: number): string {
  return `proposal-${String(id)}`;
}

export function sidesId(id: number): string {
  return `${rowId(id)}-sides`;
}

export function reasonId(id: number): string {
  return `${rowId(id)}-reason`;
}

export function finalId(id: number): string {
  return `${rowId(id)}-final`;
}

export function rowDescription(proposal: Readonly<Proposal>): string | undefined {
  const ids = [
    ...(proposal.kind === "items-disagree" ? [sidesId(proposal.id), reasonId(proposal.id)] : []),
    ...(proposal.state === "open" ? [finalId(proposal.id)] : []),
  ];

  return ids.length === 0 ? undefined : ids.join(" ");
}
