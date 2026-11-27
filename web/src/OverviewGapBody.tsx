import type { OverviewGapProposal } from "../../src/core/contract/proposal-contract.ts";
import { FinalLine } from "./FinalLine.tsx";
import { OVERVIEW_GAP_EFFECT, PROPOSAL_WORDS, overviewCounts } from "./proposals-text.ts";
import { TopicEffect } from "./TopicEffect.tsx";

export function OverviewGapBody({ proposal }: Readonly<{ proposal: OverviewGapProposal }>) {
  const { topic } = proposal;

  return (
    <>
      <TopicEffect effect={OVERVIEW_GAP_EFFECT} topic={topic} />
      <p className="rl-sum pr-gap">{overviewCounts(topic)}</p>
      <FinalLine proposal={proposal} className="pr-overview" text={PROPOSAL_WORDS.overviewCost} />
    </>
  );
}
