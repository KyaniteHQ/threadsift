import type { OverviewGapProposal } from "../../src/core/proposal-contract.ts";
import { OVERVIEW_GAP_EFFECT, PROPOSAL_WORDS, overviewCounts } from "./proposals-text.ts";
import { TopicEffect } from "./TopicEffect.tsx";

export function OverviewGapBody({
  proposal,
  openTopic,
}: Readonly<{ proposal: OverviewGapProposal; openTopic: (key: string) => void }>) {
  const { topic } = proposal;

  return (
    <>
      <TopicEffect effect={OVERVIEW_GAP_EFFECT} topic={topic} openTopic={openTopic} />
      <p className="rl-sum pr-gap">{overviewCounts(topic)}</p>
      <p className="rl-sum pr-overview">{PROPOSAL_WORDS.overviewCost}</p>
    </>
  );
}
