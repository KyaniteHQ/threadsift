import type { Proposal } from "../../src/core/contract/proposal-contract.ts";
import { finalId } from "./proposal-dom.ts";

export function FinalLine({
  proposal,
  className,
  text,
}: Readonly<{ proposal: Proposal; className: string; text: string }>) {
  return proposal.state === "open" ? (
    <p id={finalId(proposal.id)} className={`rl-sum ${className}`}>
      {text}
    </p>
  ) : null;
}
