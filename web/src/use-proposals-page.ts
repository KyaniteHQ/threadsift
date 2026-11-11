import { type Dispatch, type RefObject, type SetStateAction, useCallback, useState } from "react";

import type { Proposal, ProposalPage } from "../../src/core/proposal-contract.ts";
import { sendReject, fetchProposals } from "./proposals-api.ts";
import { PROPOSAL_WORDS, rejectedAnnouncement } from "./proposals-text.ts";
import type { Announcement } from "./use-announcement.ts";
import { useLatest } from "./use-latest.ts";
import { type Paged, type PagedReady, usePagedRead } from "./use-paged-read.ts";

export type ProposalsReady = PagedReady<ProposalPage>;

export type ProposalsState = Paged<ProposalPage>;

const SILENT: Announcement = { text: "", failed: false };

export type Focus =
  | { readonly kind: "none" }
  | { readonly kind: "row"; readonly id: number }
  | { readonly kind: "heading" };

const NO_FOCUS: Focus = { kind: "none" };

function focusAfterLeaving(state: Readonly<ProposalsState>, id: number): Focus {
  if (state.status !== "ready") return { kind: "heading" };

  const at = state.proposals.findIndex((each) => each.id === id);
  const next = state.proposals[at + 1] ?? state.proposals[at - 1];

  return next === undefined ? { kind: "heading" } : { kind: "row", id: next.id };
}

function withMoreProposals(shown: Readonly<ProposalPage>, added: Readonly<ProposalPage>) {
  return { ...added, proposals: [...shown.proposals, ...added.proposals] };
}

function reachesBelow(boundary: number) {
  return (page: Readonly<ProposalPage>): boolean => (page.proposals.at(-1)?.id ?? 0) <= boundary;
}

function onlyRowOfMore(state: Readonly<ProposalsState>, id: number): boolean {
  return (
    state.status === "ready" &&
    state.next !== null &&
    state.proposals.every((each) => each.id === id)
  );
}

function without(page: Readonly<ProposalPage>, id: number): ProposalPage {
  return { ...page, proposals: page.proposals.filter((each) => each.id !== id) };
}

interface Settling {
  readonly reread: (
    through: (page: Readonly<ProposalPage>) => boolean,
  ) => Promise<ProposalPage | null>;
  readonly lastLoaded: () => number;
  readonly setFailed: Dispatch<SetStateAction<ReadonlySet<number>>>;
  readonly setFocus: Dispatch<SetStateAction<Focus>>;
  readonly say: (text: string) => void;
  readonly setNotice: (text: string | null) => void;
}

function useSettle({
  reread,
  lastLoaded,
  setFailed,
  setFocus,
  say,
  setNotice,
}: Readonly<Settling>) {
  return useCallback(
    async (proposal: Readonly<Proposal>) => {
      const page = await reread(reachesBelow(lastLoaded()));

      if (page !== null && !page.proposals.some(({ id }) => id === proposal.id)) {
        setNotice(PROPOSAL_WORDS.alreadyDecided);
        say(PROPOSAL_WORDS.alreadyDecided);
        setFocus({ kind: "heading" });

        return;
      }

      setFailed((now) => new Set(now).add(proposal.id));
    },
    [lastLoaded, reread, say, setFailed, setFocus, setNotice],
  );
}

function withoutId(ids: Readonly<ReadonlySet<number>>, id: number): ReadonlySet<number> {
  return new Set([...ids].filter((each) => each !== id));
}

interface Leaving {
  readonly latest: Readonly<RefObject<Readonly<ProposalsState>>>;
  readonly edit: (change: (page: Readonly<ProposalPage>) => ProposalPage) => void;
  readonly reread: Settling["reread"];
  readonly setFocus: Dispatch<SetStateAction<Focus>>;
}

function useLeave({ latest, edit, reread, setFocus }: Readonly<Leaving>) {
  return useCallback(
    async (proposal: Readonly<Proposal>) => {
      setFocus(focusAfterLeaving(latest.current, proposal.id));

      const reloaded = onlyRowOfMore(latest.current, proposal.id) ? await reread(() => true) : null;

      if (reloaded === null) edit((page) => without(page, proposal.id));
    },
    [edit, latest, reread, setFocus],
  );
}

export function useProposalsPage() {
  const source = usePagedRead(fetchProposals, withMoreProposals);
  const { state, edit, reread } = source;
  const latest = useLatest(state);
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());
  const [focus, setFocus] = useState(NO_FOCUS);
  const [announcement, setAnnouncement] = useState<Announcement>(SILENT);
  const [notice, setNotice] = useState<string | null>(null);

  const say = useCallback((text: string) => {
    setAnnouncement({ text, failed: false });
  }, []);

  const lastLoaded = useCallback(() => {
    const now = latest.current;

    return now.status === "ready" ? (now.proposals.at(-1)?.id ?? 0) : 0;
  }, [latest]);

  const settle = useSettle({ reread, lastLoaded, setFailed, setFocus, say, setNotice });
  const leave = useLeave({ latest, edit, reread, setFocus });

  const reject = useCallback(
    async (proposal: Readonly<Proposal>) => {
      setPending((now) => new Set(now).add(proposal.id));
      setNotice(null);
      setFailed((now) => withoutId(now, proposal.id));

      if ((await sendReject(proposal.id)) === "rejected") {
        await leave(proposal);
        say(rejectedAnnouncement(proposal.from.name, proposal.into.name));
      } else {
        await settle(proposal);
      }

      setPending((now) => withoutId(now, proposal.id));
    },
    [leave, say, settle],
  );

  const focused = useCallback(() => {
    setFocus(NO_FOCUS);
  }, []);

  return { source, pending, failed, announcement, notice, focus, focused, reject };
}
