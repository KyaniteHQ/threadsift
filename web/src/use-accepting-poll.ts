import { type RefObject, useCallback } from "react";

import type { ProposalPage } from "../../src/core/proposal-contract.ts";
import { type AcceptableProposal, isAcceptable } from "./proposals-text.ts";
import type { Paged } from "./use-paged-read.ts";
import { usePolling } from "./use-polling.ts";

type State = Paged<ProposalPage>;

export function applyingRows(state: Readonly<State>): readonly AcceptableProposal[] {
  return state.status === "ready"
    ? state.proposals.filter(isAcceptable).filter(({ state: each }) => each === "accepting")
    : [];
}

export function leftRows(
  before: Readonly<State>,
  page: Readonly<ProposalPage>,
): readonly AcceptableProposal[] {
  return applyingRows(before).filter(({ id }) => !page.proposals.some((each) => each.id === id));
}

interface Poll {
  readonly applying: boolean;
  readonly latest: Readonly<RefObject<Readonly<State>>>;
  readonly refresh: () => Promise<ProposalPage | null>;
  readonly gone: (rows: readonly AcceptableProposal[], before: Readonly<State>) => void;
}

export function useAcceptingPoll({ applying, latest, refresh, gone }: Readonly<Poll>) {
  const poll = useCallback(async () => {
    const before = latest.current;
    const page = await refresh();

    if (page === null) return;

    const missing = leftRows(before, page);

    if (missing.length > 0) gone(missing, before);
  }, [gone, latest, refresh]);

  usePolling(applying, poll);
}
