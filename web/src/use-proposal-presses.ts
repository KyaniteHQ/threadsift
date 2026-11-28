import { useCallback, useRef, useState } from "react";

import type { Proposal } from "../../src/core/contract/proposal-contract.ts";
import { stateAfterWaiting } from "./proposal-check.ts";
import { type Answer, type Busy, type Failure, sendAccept, sendReject } from "./proposals-api.ts";
import { PROPOSAL_WORDS, acceptedAnnouncement, rejectedAnnouncement } from "./proposals-text.ts";
import type { Restoring } from "./unavailable.ts";

export type RowState =
  | { readonly kind: "idle" }
  | { readonly kind: "pressing" }
  | { readonly kind: "failed"; readonly failure: Failure }
  | { readonly kind: "busy"; readonly busy: Busy }
  | Restoring;

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

function afterAnswer(proposal: Readonly<Proposal>, answer: Answer): Result | Promise<Result> {
  switch (answer) {
    case "done":
      return { row: IDLE, text: acceptedAnnouncement(proposal) };
    case "accepting":
      return { row: IDLE, text: null };
    case "merge-busy":
    case "no-provider":
      return { row: { kind: "busy", busy: answer }, text: null };
    case "not-current":
      return { row: IDLE, text: PROPOSAL_WORDS.alreadyDecided };
    case "not-open":
    case "merge-failed":
    case "unknown":
      return check(proposal, "accept");
    default: {
      const exhaustive: never = answer;

      return exhaustive;
    }
  }
}

async function accept(proposal: Readonly<Proposal>): Promise<Result> {
  const outcome = await sendAccept(proposal.id);

  switch (outcome.kind) {
    case "restoring":
      return { row: outcome, text: null };
    case "answer":
      return afterAnswer(proposal, outcome.answer);
    default: {
      const exhaustive: never = outcome;

      return exhaustive;
    }
  }
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
    (proposal: Readonly<Proposal>) => {
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
