import { type RefObject, useCallback } from "react";

import type { Proposal, ProposalPage } from "../../src/core/proposal-contract.ts";
import type { Paged } from "./use-paged-read.ts";
import { usePolling } from "./use-polling.ts";

type State = Paged<ProposalPage>;

export function applyingRows(state: Readonly<State>): readonly Proposal[] {
  return state.status === "ready"
    ? state.proposals.filter(({ state: each }) => each === "accepting")
    : [];
}

interface Poll {
  readonly applying: boolean;
  readonly latest: Readonly<RefObject<Readonly<State>>>;
  readonly refresh: () => Promise<ProposalPage | null>;
  readonly gone: (rows: readonly Proposal[], before: Readonly<State>) => void;
}

export function useAcceptingPoll({ applying, latest, refresh, gone }: Readonly<Poll>) {
  const poll = useCallback(async () => {
    const before = latest.current;
    const watched = applyingRows(before);
    const page = await refresh();

    if (page === null) return;

    const missing = watched.filter(({ id }) => !page.proposals.some((each) => each.id === id));

    if (missing.length > 0) gone(missing, before);
  }, [gone, latest, refresh]);

  usePolling(applying, poll);
}
