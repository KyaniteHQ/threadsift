import { useCallback } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { ItemsDisagreeProposal } from "../../src/core/proposal-contract.ts";
import { topicPath } from "../../src/core/topic-path.ts";
import { ITEMS_DISAGREE_EFFECT, PROPOSAL_WORDS } from "./proposals-text.ts";
import { useInternalLink } from "./routing.ts";

type Side = ItemsDisagreeProposal["first"];

function SideOf({ side, openItem }: Readonly<{ side: Side; openItem: (id: number) => void }>) {
  const go = useInternalLink(
    useCallback(() => {
      openItem(side.id);
    }, [openItem, side.id]),
  );

  return (
    <li className="pr-side">
      <a className="pr-place pr-side-title" href={itemPath(side.id)} onClick={go}>
        <bdi dir="auto">{side.title}</bdi>
      </a>
      <p className="rl-sum pr-side-summary" dir="auto">
        <span className="vh">{PROPOSAL_WORDS.summaryLabel}: </span>
        {side.summary}
      </p>
    </li>
  );
}

export function ItemsDisagreeBody({
  proposal,
  openItem,
  openTopic,
}: Readonly<{
  proposal: ItemsDisagreeProposal;
  openItem: (id: number) => void;
  openTopic: (key: string) => void;
}>) {
  const { topic, first, second, reason } = proposal;

  const go = useInternalLink(
    useCallback(() => {
      openTopic(topic.key);
    }, [openTopic, topic.key]),
  );

  return (
    <>
      <h3 className="rl-title pr-effect">
        {ITEMS_DISAGREE_EFFECT.before}
        <a className="pr-place" href={topicPath(topic.key)} onClick={go}>
          <bdi dir="auto">{topic.name}</bdi>
        </a>
        {ITEMS_DISAGREE_EFFECT.after}
      </h3>
      <ul className="pr-sides">
        <SideOf side={first} openItem={openItem} />
        <SideOf side={second} openItem={openItem} />
      </ul>
      <p className="rl-sum pr-reason" dir="auto">
        <span className="vh">{PROPOSAL_WORDS.reasonLabel}: </span>
        {reason}
      </p>
    </>
  );
}
