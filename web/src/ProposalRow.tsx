import { memo, useCallback } from "react";

import type { Proposal } from "../../src/core/proposal-contract.ts";
import { ACCEPT_CLASS, REJECT_CLASS, rowId } from "./proposal-dom.ts";
import {
  PROPOSAL_WORDS,
  acceptLabel,
  acceptRetryLabel,
  itemsOfTag,
  rejectLabel,
  rejectRetryLabel,
} from "./proposals-text.ts";
import { RETRY_LABEL } from "./text.ts";
import type { Failure } from "./use-proposals-page.ts";

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

interface RowControls {
  readonly proposal: Proposal;
  readonly pending: boolean;
  readonly failure: Failure | undefined;
  readonly busy: boolean;
  readonly accept: (proposal: Proposal) => void;
  readonly reject: (proposal: Proposal) => void;
}

function Note({ children, alert }: Readonly<{ children: string; alert: boolean }>) {
  return (
    <p className="rd-note" role={alert ? "alert" : "status"}>
      {children}
    </p>
  );
}

function Notes({
  failure,
  busy,
  applying,
}: Readonly<{ failure: Failure | undefined; busy: boolean; applying: boolean }>) {
  if (applying) return <Note alert={false}>{PROPOSAL_WORDS.applying}</Note>;

  if (failure === "accept") return <Note alert>{PROPOSAL_WORDS.acceptFailed}</Note>;

  if (failure === "reject") return <Note alert>{PROPOSAL_WORDS.rejectFailed}</Note>;

  return busy ? <Note alert={false}>{PROPOSAL_WORDS.busy}</Note> : null;
}

function Actions({ proposal, pending, failure, busy, accept, reject }: Readonly<RowControls>) {
  const applying = proposal.state === "accepting";
  const locked = pending || applying;

  const pressAccept = useCallback(() => {
    if (!locked) accept(proposal);
  }, [accept, locked, proposal]);

  const pressReject = useCallback(() => {
    if (!locked) reject(proposal);
  }, [locked, proposal, reject]);

  return (
    <div className="pr-actions">
      <button
        type="button"
        className={`btn btn-acc ${ACCEPT_CLASS}`}
        aria-label={(failure === "accept" ? acceptRetryLabel : acceptLabel)(
          proposal.from.name,
          proposal.into.name,
        )}
        aria-disabled={locked}
        onClick={pressAccept}
      >
        {failure === "accept" ? RETRY_LABEL : PROPOSAL_WORDS.accept}
      </button>
      <button
        type="button"
        className={`btn ${REJECT_CLASS}`}
        aria-label={(failure === "reject" ? rejectRetryLabel : rejectLabel)(
          proposal.from.name,
          proposal.into.name,
        )}
        aria-disabled={locked}
        onClick={pressReject}
      >
        {failure === "reject" ? RETRY_LABEL : PROPOSAL_WORDS.reject}
      </button>
      <Notes failure={failure} busy={busy} applying={applying} />
    </div>
  );
}

export const ProposalRow = memo(function ProposalRow(controls: Readonly<RowControls>) {
  const { proposal } = controls;
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
        <Actions {...controls} />
      </article>
    </li>
  );
});
