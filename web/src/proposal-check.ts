import type { ProposalState } from "../../src/core/contract/proposal-contract.ts";
import { pause } from "./pause.ts";
import { POLL_MS } from "./poll-interval.ts";
import { fetchProposalState } from "./proposals-api.ts";

const UNDECIDED_CHECKS = 4;

type Held = ProposalState | "gone" | null;

export async function stateAfterWaiting(id: number): Promise<Held> {
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
