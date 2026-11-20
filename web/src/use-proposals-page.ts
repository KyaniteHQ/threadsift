import { useCallback, useState } from "react";

import type { ProposalPage } from "../../src/core/contract/proposal-contract.ts";
import { fetchProposals } from "./proposals-api.ts";
import { usePagedRead } from "./use-paged-read.ts";
import { usePolling } from "./use-polling.ts";
import { usePresses } from "./use-proposal-presses.ts";

const SILENT = "";

function withMoreProposals(shown: Readonly<ProposalPage>, added: Readonly<ProposalPage>) {
  return { ...added, proposals: [...shown.proposals, ...added.proposals] };
}

export function useProposalsPage() {
  const source = usePagedRead(fetchProposals, withMoreProposals);
  const { state, retry } = source;
  const [focusResult, setFocusResult] = useState(false);
  const [announcement, setAnnouncement] = useState(SILENT);
  const [notice, setNotice] = useState<string | null>(null);

  const begin = useCallback(() => {
    setNotice(null);
    setAnnouncement(SILENT);
  }, []);

  const finish = useCallback(
    async (text: string | null) => {
      setNotice(text);

      if (text !== null) setAnnouncement(text);
      await retry();
      setFocusResult(true);
    },
    [retry],
  );

  const focusedResult = useCallback(() => {
    setFocusResult(false);
  }, []);

  const { rowFor, ...press } = usePresses({ begin, finish });

  const poll = useCallback(() => retry(true), [retry]);

  usePolling(
    state.status === "ready" && state.proposals.some(({ state: each }) => each === "accepting"),
    poll,
  );

  return { source, rowFor, announcement, notice, focusResult, focusedResult, press };
}
