import { useCallback } from "react";

import type { Proposal } from "../../src/core/proposal-contract.ts";
import { ACCEPT_CLASS, REJECT_CLASS } from "./proposal-dom.ts";
import type { Busy } from "./proposals-api.ts";
import {
  type AcceptableProposal,
  PROPOSAL_WORDS,
  acceptLabel,
  acceptRetryLabel,
  isAcceptable,
  rejectLabel,
  rejectRetryLabel,
} from "./proposals-text.ts";
import { RETRY_LABEL } from "./text.ts";
import type { Failure } from "./use-proposals-page.ts";

export interface RowControls {
  readonly proposal: Proposal;
  readonly overviewFollows: boolean;
  readonly pending: boolean;
  readonly failure: Failure | undefined;
  readonly busy: Busy | undefined;
  readonly accept: (proposal: AcceptableProposal) => void;
  readonly reject: (proposal: Proposal) => void;
  readonly open: (itemId: number, highlightId: number) => void;
  readonly openTopic: (key: string) => void;
  readonly openItem: (id: number) => void;
}

function Note({ children, alert }: Readonly<{ children: string; alert: boolean }>) {
  return (
    <p className="rd-note" role={alert ? "alert" : "status"}>
      {children}
    </p>
  );
}

const BUSY_NOTES = {
  "merge-busy": PROPOSAL_WORDS.mergeBusy,
  "topic-busy": PROPOSAL_WORDS.topicBusy,
  "no-provider": PROPOSAL_WORDS.noProvider,
} as const satisfies Record<Busy, string>;

function Notes({
  failure,
  busy,
  applying,
}: Readonly<{ failure: Failure | undefined; busy: Busy | undefined; applying: boolean }>) {
  if (applying) return <Note alert={false}>{PROPOSAL_WORDS.applying}</Note>;

  if (failure === "accept") return <Note alert>{PROPOSAL_WORDS.acceptFailed}</Note>;

  if (failure === "reject") return <Note alert>{PROPOSAL_WORDS.rejectFailed}</Note>;

  return busy === undefined ? null : <Note alert={false}>{BUSY_NOTES[busy]}</Note>;
}

export function Actions({
  proposal,
  pending,
  failure,
  busy,
  accept,
  reject,
}: Readonly<RowControls>) {
  const applying = proposal.state === "accepting";
  const locked = pending || applying;

  const pressAccept = useCallback(() => {
    if (!locked && isAcceptable(proposal)) accept(proposal);
  }, [accept, locked, proposal]);

  const pressReject = useCallback(() => {
    if (!locked) reject(proposal);
  }, [locked, proposal, reject]);

  return (
    <div className="pr-actions">
      {isAcceptable(proposal) && (
        <button
          type="button"
          className={`btn btn-acc ${ACCEPT_CLASS}`}
          aria-label={(failure === "accept" ? acceptRetryLabel : acceptLabel)(proposal)}
          aria-disabled={locked}
          onClick={pressAccept}
        >
          {failure === "accept" ? RETRY_LABEL : PROPOSAL_WORDS.accept}
        </button>
      )}
      <button
        type="button"
        className={`btn ${REJECT_CLASS}`}
        aria-label={(failure === "reject" ? rejectRetryLabel : rejectLabel)(proposal)}
        aria-disabled={locked}
        onClick={pressReject}
      >
        {failure === "reject" ? RETRY_LABEL : PROPOSAL_WORDS.reject}
      </button>
      <Notes failure={failure} busy={busy} applying={applying} />
    </div>
  );
}
