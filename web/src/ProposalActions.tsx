import { useCallback } from "react";

import type { Proposal } from "../../src/core/contract/proposal-contract.ts";
import { ACCEPT_CLASS, REJECT_CLASS, rowDescription } from "./proposal-dom.ts";
import type { Busy } from "./proposals-api.ts";
import {
  PROPOSAL_WORDS,
  acceptLabel,
  acceptRetryLabel,
  applyFailedNote,
  isMerge,
  rejectLabel,
  rejectRetryLabel,
} from "./proposals-text.ts";
import { RETRY_LABEL } from "./text.ts";
import type { RowState } from "./use-proposal-presses.ts";

export interface RowControls {
  readonly proposal: Proposal;
  readonly overviewFollows: boolean;
  readonly row: RowState;
  readonly accept: (proposal: Proposal) => void;
  readonly reject: (proposal: Proposal) => void;
}

const BUSY_NOTES = {
  "merge-busy": PROPOSAL_WORDS.mergeBusy,
  "no-provider": PROPOSAL_WORDS.noProvider,
} as const satisfies Record<Busy, string>;

function alertOf(row: RowState): string | null {
  if (row.kind !== "failed") return null;

  return row.failure === "accept" ? PROPOSAL_WORDS.acceptFailed : PROPOSAL_WORDS.rejectFailed;
}

function statusOf(row: RowState, applying: boolean): string | null {
  if (applying) return PROPOSAL_WORDS.applying;

  return row.kind === "busy" ? BUSY_NOTES[row.busy] : null;
}

function Notes({
  proposal,
  row,
  applying,
}: Readonly<{ proposal: Proposal; row: RowState; applying: boolean }>) {
  return (
    <>
      <p className="rd-note" role="alert">
        {applying ? null : alertOf(row)}
      </p>
      <output className="rd-note">{statusOf(row, applying)}</output>
      {applying && isMerge(proposal) && proposal.failedRuns > 0 && (
        <p className="rd-note">{applyFailedNote(proposal.failedRuns)}</p>
      )}
    </>
  );
}

export function Actions({ proposal, row, accept, reject }: Readonly<RowControls>) {
  const applying = proposal.state === "accepting";
  const locked = row.kind === "pressing" || applying;
  const failure = row.kind === "failed" ? row.failure : undefined;

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
        aria-label={(failure === "accept" ? acceptRetryLabel : acceptLabel)(proposal)}
        aria-describedby={rowDescription(proposal)}
        aria-disabled={locked}
        onClick={pressAccept}
      >
        {failure === "accept" ? RETRY_LABEL : PROPOSAL_WORDS.accept}
      </button>
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
      <Notes proposal={proposal} row={row} applying={applying} />
    </div>
  );
}
