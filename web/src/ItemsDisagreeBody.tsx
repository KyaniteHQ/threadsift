import { itemPath } from "../../src/core/contract/item-path.ts";
import type { ItemsDisagreeProposal } from "../../src/core/contract/proposal-contract.ts";
import { useNavigateLink } from "./navigate-context.ts";
import { reasonId, sidesId } from "./proposal-dom.ts";
import { ITEMS_DISAGREE_EFFECT, PROPOSAL_WORDS, sideNamedWords } from "./proposals-text.ts";
import { TopicEffect } from "./TopicEffect.tsx";

type Side = ItemsDisagreeProposal["first"];

function SideOf({ side, other }: Readonly<{ side: Side; other: Side }>) {
  const go = useNavigateLink(itemPath(side.id));

  return (
    <li className="pr-side">
      <a className="pr-place pr-side-title" href={itemPath(side.id)} onClick={go}>
        <bdi dir="auto">{side.title}</bdi>
        <span className="vh">, {sideNamedWords(other.title)}</span>
      </a>
      <p className="rl-sum pr-side-summary" dir="auto">
        <span className="vh">{PROPOSAL_WORDS.summaryLabel}: </span>
        {side.summary}
      </p>
    </li>
  );
}

export function ItemsDisagreeBody({ proposal }: Readonly<{ proposal: ItemsDisagreeProposal }>) {
  const { topic, first, second, reason } = proposal;

  return (
    <>
      <TopicEffect effect={ITEMS_DISAGREE_EFFECT} topic={topic} />
      <ul role="list" className="pr-sides" id={sidesId(proposal.id)}>
        <SideOf side={first} other={second} />
        <SideOf side={second} other={first} />
      </ul>
      <p className="rl-sum pr-reason" dir="auto" id={reasonId(proposal.id)}>
        <span className="vh">{PROPOSAL_WORDS.reasonLabel}: </span>
        {reason}
      </p>
      <p className="rl-sum pr-keeps">{PROPOSAL_WORDS.disagreementKept}</p>
    </>
  );
}
