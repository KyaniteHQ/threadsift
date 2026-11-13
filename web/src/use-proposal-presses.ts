import { useCallback, useMemo } from "react";

import type { Proposal } from "../../src/core/proposal-contract.ts";
import { sendReject } from "./proposals-api.ts";
import { type AcceptableProposal, PROPOSAL_WORDS, rejectedAnnouncement } from "./proposals-text.ts";

interface Presses {
  readonly start: (proposal: Readonly<Proposal>) => void;
  readonly finish: (proposal: Readonly<Proposal>) => void;
  readonly accept: (proposal: Readonly<AcceptableProposal>) => Promise<void>;
  readonly settle: (
    proposal: Readonly<Proposal>,
    failure: "reject",
    goneNote: string,
  ) => Promise<void>;
  readonly leave: (proposal: Readonly<Proposal>, departure: "rejected") => Promise<void>;
  readonly say: (text: string) => void;
}

export function usePresses({ start, finish, accept, settle, leave, say }: Readonly<Presses>) {
  const decide = useCallback(
    async (proposal: Readonly<Proposal>, run: () => Promise<void>) => {
      start(proposal);
      await run();
      finish(proposal);
    },
    [finish, start],
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
      void decide(proposal, () => accept(proposal));
    },
    [accept, decide],
  );

  const pressReject = useCallback(
    (proposal: Readonly<Proposal>) => {
      void decide(proposal, () => reject(proposal));
    },
    [decide, reject],
  );

  return useMemo(() => ({ accept: pressAccept, reject: pressReject }), [pressAccept, pressReject]);
}
