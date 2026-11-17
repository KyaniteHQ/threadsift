import { useCallback } from "react";

import type { ProposalState } from "../../src/core/kinds.ts";
import type { Proposal, ProposalPage } from "../../src/core/proposal-contract.ts";
import { pause } from "./pause.ts";
import { POLL_MS } from "./poll-interval.ts";
import type { RowEvent } from "./proposal-row-state.ts";
import { type Failure, fetchProposalState, isBusy, sendAccept } from "./proposals-api.ts";
import {
  type AcceptableProposal,
  PROPOSAL_WORDS,
  acceptedAnnouncement,
  rejectedAnnouncement,
} from "./proposals-text.ts";

export const UNDECIDED_CHECKS = 4;

type Held = ProposalState | "gone" | null;

async function stateAfterWaiting(id: number): Promise<Held> {
  let state: Held = null;

  for (let check = 0; check < UNDECIDED_CHECKS; check += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each read of the Proposal's state follows the pause after the one before.
    state = await readThenPause(id, check);

    if (state !== "open" && state !== null) return state;
  }

  return state;
}

async function readThenPause(id: number, check: number): Promise<Held> {
  const state = await fetchProposalState(id).catch(() => null);

  if ((state === "open" || state === null) && check < UNDECIDED_CHECKS - 1) await pause(POLL_MS);

  return state;
}

type Departure = "rejected" | "accepted";

type Settle = (proposal: Readonly<Proposal>, failure: Failure, goneNote: string) => Promise<void>;

type Leave = (proposal: Readonly<Proposal>, departure: Departure, says: string) => Promise<void>;

type Edit = (change: (page: Readonly<ProposalPage>) => ProposalPage) => void;

function applying(page: Readonly<ProposalPage>, id: number): ProposalPage {
  return {
    ...page,
    proposals: page.proposals.map((each) =>
      each.id === id ? { ...each, state: "accepting" as const } : each,
    ),
  };
}

interface Checking {
  readonly send: (event: RowEvent) => boolean;
  readonly edit: Edit;
  readonly settle: Settle;
  readonly leave: Leave;
}

export function useCheck({ send, edit, settle, leave }: Readonly<Checking>) {
  return useCallback(
    async (proposal: Readonly<Proposal>, failure: Failure) => {
      const state = await stateAfterWaiting(proposal.id);

      if (state === null || state === "open") {
        send({ kind: "fail", id: proposal.id, failure });
      } else if (state === "accepting" && failure === "accept") {
        edit((page) => applying(page, proposal.id));
      } else if (state === "rejected" && failure === "reject") {
        await leave(proposal, "rejected", rejectedAnnouncement(proposal));
      } else {
        await settle(proposal, failure, PROPOSAL_WORDS.alreadyDecided);
      }
    },
    [edit, leave, send, settle],
  );
}

export function useAccept({
  check,
  edit,
  leave,
  send,
  settle,
}: Readonly<Checking & { check: ReturnType<typeof useCheck> }>) {
  return useCallback(
    async (proposal: Readonly<AcceptableProposal>) => {
      const outcome = await sendAccept(proposal.id);

      if (outcome === "done") {
        await leave(proposal, "accepted", acceptedAnnouncement(proposal));
      } else if (outcome === "accepting") {
        edit((page) => applying(page, proposal.id));
      } else if (isBusy(outcome)) {
        send({ kind: "hold", id: proposal.id, busy: outcome });
      } else if (outcome === "not-current") {
        await settle(proposal, "accept", PROPOSAL_WORDS.alreadyDecided);
      } else {
        await check(proposal, "accept");
      }
    },
    [check, edit, leave, send, settle],
  );
}
