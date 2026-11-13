import { useCallback } from "react";

import type { OverviewGapProposal } from "../../src/core/proposal-contract.ts";
import { topicPath } from "../../src/core/topic-path.ts";
import { OVERVIEW_GAP_EFFECT, PROPOSAL_WORDS, overviewCounts } from "./proposals-text.ts";
import { useInternalLink } from "./routing.ts";

export function OverviewGapBody({
  proposal,
  openTopic,
}: Readonly<{ proposal: OverviewGapProposal; openTopic: (key: string) => void }>) {
  const { topic } = proposal;

  const go = useInternalLink(
    useCallback(() => {
      openTopic(topic.key);
    }, [openTopic, topic.key]),
  );

  return (
    <>
      <h3 className="rl-title pr-effect">
        {OVERVIEW_GAP_EFFECT.before}
        <a className="pr-place" href={topicPath(topic.key)} onClick={go}>
          <bdi dir="auto">{topic.name}</bdi>
        </a>
        {OVERVIEW_GAP_EFFECT.after}
      </h3>
      <p className="rl-sum pr-gap">{overviewCounts(topic)}</p>
      <p className="rl-sum pr-overview">{PROPOSAL_WORDS.overviewCost}</p>
    </>
  );
}
