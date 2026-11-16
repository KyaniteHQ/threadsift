import { useCallback, useMemo } from "react";

import type { Proposal } from "../../src/core/proposal-contract.ts";
import type { RowEvent } from "./proposal-row-state.ts";
import { type Failure, sendReject } from "./proposals-api.ts";
import { type AcceptableProposal, rejectedAnnouncement } from "./proposals-text.ts";
import { useAccept, useCheck } from "./use-proposal-check.ts";

interface Presses {
  readonly send: (event: RowEvent) => boolean;
  readonly setNotice: (text: string | null) => void;
  readonly edit: Parameters<typeof useCheck>[0]["edit"];
  readonly settle: Parameters<typeof useCheck>[0]["settle"];
  readonly leave: Parameters<typeof useCheck>[0]["leave"];
}

export function usePresses({ send, setNotice, edit, settle, leave }: Readonly<Presses>) {
  const check = useCheck({ send, edit, settle, leave });
  const accept = useAccept({ check, send, edit, settle, leave });

  const decide = useCallback(
    async (proposal: Readonly<Proposal>, action: Failure, run: () => Promise<void>) => {
      if (!send({ kind: "press", id: proposal.id, action })) return;

      setNotice(null);
      await run();
      send({ kind: "release", id: proposal.id });
    },
    [send, setNotice],
  );

  const reject = useCallback(
    async (proposal: Readonly<Proposal>) => {
      if ((await sendReject(proposal.id)) === "rejected") {
        await leave(proposal, "rejected", rejectedAnnouncement(proposal));
      } else {
        await check(proposal, "reject");
      }
    },
    [check, leave],
  );

  const pressAccept = useCallback(
    (proposal: Readonly<AcceptableProposal>) => {
      void decide(proposal, "accept", () => accept(proposal));
    },
    [accept, decide],
  );

  const pressReject = useCallback(
    (proposal: Readonly<Proposal>) => {
      void decide(proposal, "reject", () => reject(proposal));
    },
    [decide, reject],
  );

  return useMemo(() => ({ accept: pressAccept, reject: pressReject }), [pressAccept, pressReject]);
}
