import { memo } from "react";

import type { MergeProposal } from "../../src/core/contract/proposal-contract.ts";
import { ItemsDisagreeBody } from "./ItemsDisagreeBody.tsx";
import { LostHighlightBody } from "./LostHighlightBody.tsx";
import { OverviewGapBody } from "./OverviewGapBody.tsx";
import { rowId } from "./proposal-dom.ts";
import { Actions, type RowControls } from "./ProposalActions.tsx";
import { PROPOSAL_WORDS, mergeEffect } from "./proposals-text.ts";
import { itemsLabel } from "./topic-text.ts";

const SLOT = /\{(from|into)\}/u;

function Effect({ proposal }: Readonly<{ proposal: MergeProposal }>) {
  const { kind, from, into } = proposal;

  return mergeEffect(kind)
    .split(SLOT)
    .map((part) => {
      if (part === "from" || part === "into") {
        return (
          <bdi key={part} dir="auto" className="pr-name">
            {part === "from" ? from.name : into.name}
          </bdi>
        );
      }

      return part;
    });
}

function Count({ name, items }: Readonly<{ name: string; items: number }>) {
  return (
    <div>
      <dt>
        <bdi dir="auto">{name}</bdi>
      </dt>
      <dd>{itemsLabel(items)}</dd>
    </div>
  );
}

function MergeBody({
  proposal,
  overviewFollows,
}: Readonly<{ proposal: MergeProposal; overviewFollows: boolean }>) {
  const { from, into, reason } = proposal;

  return (
    <>
      <h3 className="rl-title pr-effect">
        <Effect proposal={proposal} />
      </h3>
      <dl className="rl-sum pr-counts">
        <Count name={from.name} items={from.items} />
        <Count name={into.name} items={into.items} />
      </dl>
      <p className="rl-sum pr-reason" dir="auto">
        <span className="vh">{PROPOSAL_WORDS.reasonLabel}: </span>
        {reason}
      </p>
      {proposal.kind === "topic-merge" && overviewFollows && (
        <p className="rl-sum pr-overview">{PROPOSAL_WORDS.topicOverviewEffect}</p>
      )}
    </>
  );
}

function ProposalBody({
  proposal,
  overviewFollows,
}: Readonly<Pick<RowControls, "proposal" | "overviewFollows">>) {
  switch (proposal.kind) {
    case "tag-merge":
    case "topic-merge":
      return <MergeBody proposal={proposal} overviewFollows={overviewFollows} />;
    case "highlight-lost":
      return <LostHighlightBody proposal={proposal} />;
    case "overview-gap":
      return <OverviewGapBody proposal={proposal} />;
    case "items-disagree":
      return <ItemsDisagreeBody proposal={proposal} />;
    default:
      return proposal satisfies never;
  }
}

export const ProposalRow = memo(function ProposalRow(controls: Readonly<RowControls>) {
  const { proposal, overviewFollows } = controls;

  return (
    <li>
      <article className="rl-row" id={rowId(proposal.id)}>
        <ProposalBody proposal={proposal} overviewFollows={overviewFollows} />
        <Actions {...controls} />
      </article>
    </li>
  );
});
