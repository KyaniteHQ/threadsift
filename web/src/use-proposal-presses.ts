import { useCallback, useMemo } from "react";

import type { Proposal } from "../../src/core/proposal-contract.ts";
import type { RowEvent } from "./proposal-row-state.ts";
import { type Failure, sendReject } from "./proposals-api.ts";
import { type AcceptableProposal, PROPOSAL_WORDS, rejectedAnnouncement } from "./proposals-text.ts";

interface Presses {
  readonly send: (event: RowEvent) => boolean;
  readonly setNotice: (text: string | null) => void;
  readonly accept: (proposal: Readonly<AcceptableProposal>) => Promise<void>;
  readonly settle: (
    proposal: Readonly<Proposal>,
    failure: "reject",
    goneNote: string,
  ) => Promise<void>;
  readonly leave: (proposal: Readonly<Proposal>, departure: "rejected") => Promise<void>;
  readonly say: (text: string) => void;
}

export function usePresses({ send, setNotice, accept, settle, leave, say }: Readonly<Presses>) {
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
        await leave(proposal, "rejected");
        say(rejectedAnnouncement(proposal));
      } else {
        await settle(proposal, "reject", PROPOSAL_WORDS.alreadyDecided);
      }
    },
    [leave, say, settle],
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
