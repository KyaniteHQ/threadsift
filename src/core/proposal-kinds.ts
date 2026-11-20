import { ITEMS_DISAGREE } from "./disagreement-proposal.ts";
import { LOST_HIGHLIGHT } from "./highlight-proposals.ts";
import type { JobPorts } from "./job-outcome.ts";
import { mergeProposal } from "./merge-proposal.ts";
import { OVERVIEW_GAP } from "./overview-proposals.ts";
import { PROPOSAL_KINDS, type ProposalKind } from "./proposal-contract.ts";
import type { ProposalKindSpec } from "./proposal-kind.ts";

export const PROPOSAL = {
  "tag-merge": mergeProposal("tag-merge"),
  "topic-merge": mergeProposal("topic-merge"),
  "highlight-lost": LOST_HIGHLIGHT,
  "overview-gap": OVERVIEW_GAP,
  "items-disagree": ITEMS_DISAGREE,
} as const satisfies { readonly [Kind in ProposalKind]: ProposalKindSpec<Kind> };

export function weeklyStages(
  ports: JobPorts,
  now: number,
): readonly (readonly [name: string, run: () => Promise<void>])[] {
  return PROPOSAL_KINDS.map((kind) => [
    PROPOSAL[kind].stage,
    () => PROPOSAL[kind].weekly.run(ports, now),
  ]);
}
