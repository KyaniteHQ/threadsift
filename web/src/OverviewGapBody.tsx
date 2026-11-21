import type { OverviewGapProposal } from "../../src/core/contract/proposal-contract.ts";
import { OVERVIEW_GAP_EFFECT, PROPOSAL_WORDS, overviewCounts } from "./proposals-text.ts";
import { TopicEffect } from "./TopicEffect.tsx";

export function OverviewGapBody({ proposal }: Readonly<{ proposal: OverviewGapProposal }>) {
  const { topic } = proposal;

  return (
    <>
      <TopicEffect effect={OVERVIEW_GAP_EFFECT} topic={topic} />
      <p className="rl-sum pr-gap">{overviewCounts(topic)}</p>
      <p className="rl-sum pr-overview">{PROPOSAL_WORDS.overviewCost}</p>
    </>
  );
}
