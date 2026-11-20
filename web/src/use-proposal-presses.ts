import { useCallback, useRef, useState } from "react";

import type { Proposal } from "../../src/core/contract/proposal-contract.ts";
import { stateAfterWaiting } from "./proposal-check.ts";
import { type Busy, type Failure, isBusy, sendAccept, sendReject } from "./proposals-api.ts";
import {
  type AcceptableProposal,
  PROPOSAL_WORDS,
  acceptedAnnouncement,
  rejectedAnnouncement,
} from "./proposals-text.ts";

export type RowState =
  | { readonly kind: "idle" }
  | { readonly kind: "pressing" }
  | { readonly kind: "failed"; readonly failure: Failure }
  | { readonly kind: "busy"; readonly busy: Busy };

const IDLE: RowState = { kind: "idle" };

type Result = { readonly row: RowState; readonly text: string | null };

async function check(proposal: Readonly<Proposal>, action: Failure): Promise<Result> {
  const state = await stateAfterWaiting(proposal.id);

  if (state === null || state === "open")
    return { row: { kind: "failed", failure: action }, text: null };

  if (state === "accepting") return { row: IDLE, text: null };

  return {
    row: IDLE,
    text:
      state === "rejected" && action === "reject"
        ? rejectedAnnouncement(proposal)
        : PROPOSAL_WORDS.alreadyDecided,
  };
}

async function accept(proposal: Readonly<AcceptableProposal>): Promise<Result> {
  const outcome = await sendAccept(proposal.id);

  if (outcome === "done") return { row: IDLE, text: acceptedAnnouncement(proposal) };

  if (outcome === "accepting") return { row: IDLE, text: null };

  if (isBusy(outcome)) return { row: { kind: "busy", busy: outcome }, text: null };

  if (outcome === "not-current") return { row: IDLE, text: PROPOSAL_WORDS.alreadyDecided };

  return check(proposal, "accept");
}

async function reject(proposal: Readonly<Proposal>): Promise<Result> {
  return (await sendReject(proposal.id)) === "rejected"
    ? { row: IDLE, text: rejectedAnnouncement(proposal) }
    : check(proposal, "reject");
}

interface Presses {
  readonly begin: () => void;
  readonly finish: (text: string | null) => Promise<void>;
}

export function usePresses({ begin, finish }: Readonly<Presses>) {
  const busyId = useRef<number | null>(null);
  const [row, setRow] = useState<{ readonly id: number; readonly state: RowState } | null>(null);

  const decide = useCallback(
    async (proposal: Readonly<Proposal>, run: () => Promise<Result>) => {
      if (busyId.current !== null) return;

      busyId.current = proposal.id;
      begin();
      setRow({ id: proposal.id, state: { kind: "pressing" } });

      try {
        const result = await run();

        if (result.row.kind === "idle") await finish(result.text);
        setRow({ id: proposal.id, state: result.row });
      } finally {
        busyId.current = null;
        setRow((current) => (current?.state.kind === "pressing" ? null : current));
      }
    },
    [begin, finish],
  );

  const rowFor = useCallback(
    (id: number): RowState => (row?.state.kind === "pressing" || row?.id === id ? row.state : IDLE),
    [row],
  );

  const pressAccept = useCallback(
    (proposal: Readonly<AcceptableProposal>) => {
      void decide(proposal, () => accept(proposal));
    },
    [decide],
  );

  const pressReject = useCallback(
    (proposal: Readonly<Proposal>) => {
      void decide(proposal, () => reject(proposal));
    },
    [decide],
  );

  return { rowFor, accept: pressAccept, reject: pressReject };
}
