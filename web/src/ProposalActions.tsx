import { useCallback } from "react";

import type { Proposal } from "../../src/core/proposal-contract.ts";
import { ACCEPT_CLASS, REJECT_CLASS, rowDescription } from "./proposal-dom.ts";
import type { RowState } from "./proposal-row-state.ts";
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

export interface RowControls {
  readonly proposal: Proposal;
  readonly overviewFollows: boolean;
  readonly row: RowState;
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

function Notes({ row, applying }: Readonly<{ row: RowState; applying: boolean }>) {
  if (applying) return <Note alert={false}>{PROPOSAL_WORDS.applying}</Note>;

  switch (row.kind) {
    case "failed":
      return (
        <Note alert>
          {row.failure === "accept" ? PROPOSAL_WORDS.acceptFailed : PROPOSAL_WORDS.rejectFailed}
        </Note>
      );
    case "busy":
      return <Note alert={false}>{BUSY_NOTES[row.busy]}</Note>;
    case "pressing":
      return row.busy === null ? null : <Note alert={false}>{BUSY_NOTES[row.busy]}</Note>;
    case "idle":
      return null;
    default:
      return row satisfies never;
  }
}

export function Actions({ proposal, row, accept, reject }: Readonly<RowControls>) {
  const applying = proposal.state === "accepting";
  const locked = row.kind === "pressing" || applying;
  const failure = row.kind === "failed" ? row.failure : undefined;

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
          aria-describedby={rowDescription(proposal)}
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
        aria-describedby={rowDescription(proposal)}
        aria-disabled={locked}
        onClick={pressReject}
      >
        {failure === "reject" ? RETRY_LABEL : PROPOSAL_WORDS.reject}
      </button>
      <Notes row={row} applying={applying} />
    </div>
  );
}
