import { memo, useCallback } from "react";

import type { Proposal } from "../../src/core/proposal-contract.ts";
import { REJECT_CLASS, rowId } from "./proposal-dom.ts";
import { PROPOSAL_WORDS, itemsOfTag, rejectLabel, rejectRetryLabel } from "./proposals-text.ts";
import { RETRY_LABEL } from "./text.ts";

const SLOT = /\{(from|into)\}/u;

function Effect({ from, into }: Readonly<{ from: string; into: string }>) {
  return PROPOSAL_WORDS.effect.split(SLOT).map((part) => {
    if (part === "from" || part === "into") {
      return (
        <bdi key={part} dir="auto" className="pr-name">
          {part === "from" ? from : into}
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
      <dd>{itemsOfTag(items)}</dd>
    </div>
  );
}

function Actions({
  proposal,
  pending,
  failed,
  reject,
}: Readonly<{
  proposal: Proposal;
  pending: boolean;
  failed: boolean;
  reject: (proposal: Proposal) => void;
}>) {
  const press = useCallback(() => {
    if (!pending) reject(proposal);
  }, [pending, proposal, reject]);

  return (
    <div className="pr-actions">
      <button
        type="button"
        className={`btn ${REJECT_CLASS}`}
        aria-label={(failed ? rejectRetryLabel : rejectLabel)(
          proposal.from.name,
          proposal.into.name,
        )}
        aria-disabled={pending}
        onClick={press}
      >
        {failed ? RETRY_LABEL : PROPOSAL_WORDS.reject}
      </button>
      {failed ? (
        <p className="rd-note" role="alert">
          {PROPOSAL_WORDS.rejectFailed}
        </p>
      ) : null}
    </div>
  );
}

export const ProposalRow = memo(function ProposalRow({
  proposal,
  pending,
  failed,
  reject,
}: Readonly<{
  proposal: Proposal;
  pending: boolean;
  failed: boolean;
  reject: (proposal: Proposal) => void;
}>) {
  const { from, into, reason } = proposal;

  return (
    <li>
      <article className="rl-row pr-row" id={rowId(proposal.id)}>
        <h3 className="rl-title pr-effect">
          <Effect from={from.name} into={into.name} />
        </h3>
        <dl className="rl-sum pr-counts">
          <Count name={from.name} items={from.items} />
          <Count name={into.name} items={into.items} />
        </dl>
        <p className="rl-sum pr-reason" dir="auto">
          <span className="vh">{PROPOSAL_WORDS.reasonLabel}: </span>
          {reason}
        </p>
        <Actions proposal={proposal} pending={pending} failed={failed} reject={reject} />
      </article>
    </li>
  );
});
