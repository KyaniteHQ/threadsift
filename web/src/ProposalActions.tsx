import { useCallback } from "react";

import type { Proposal } from "../../src/core/contract/proposal-contract.ts";
import { AiSettingsLink } from "./AiSettingsLink.tsx";
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
  restoring: PROPOSAL_WORDS.restoring,
} as const satisfies Record<Busy, string>;

interface NoteTexts {
  readonly alert: string | null;
  readonly status: string | null;
}

const NO_NOTES: NoteTexts = { alert: null, status: null };

function notesOf(row: RowState, applying: boolean): NoteTexts {
  if (applying) return { alert: null, status: PROPOSAL_WORDS.applying };

  switch (row.kind) {
    case "failed":
      return {
        alert: row.failure === "accept" ? PROPOSAL_WORDS.acceptFailed : PROPOSAL_WORDS.rejectFailed,
        status: null,
      };
    case "busy":
      return { alert: null, status: BUSY_NOTES[row.busy] };
    case "pressing":
    case "idle":
      return NO_NOTES;
    default:
      return row satisfies never;
  }
}

function Notes({
  proposal,
  row,
  applying,
}: Readonly<{ proposal: Proposal; row: RowState; applying: boolean }>) {
  const { alert, status } = notesOf(row, applying);

  return (
    <>
      <p className="rd-note" role="alert">
        {alert}
      </p>
      <output className="rd-note">{status}</output>
      {row.kind === "busy" && row.busy === "no-provider" ? <AiSettingsLink /> : null}
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
