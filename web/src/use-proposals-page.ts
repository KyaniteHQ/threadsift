import { type Dispatch, type RefObject, type SetStateAction, useCallback, useState } from "react";

import type { Proposal, ProposalPage } from "../../src/core/proposal-contract.ts";
import { sendAccept, sendReject, fetchProposals } from "./proposals-api.ts";
import { PROPOSAL_WORDS, acceptedAnnouncement, rejectedAnnouncement } from "./proposals-text.ts";
import { applyingRows, useAcceptingPoll } from "./use-accepting-poll.ts";
import type { Announcement } from "./use-announcement.ts";
import { useLatest } from "./use-latest.ts";
import { type Paged, type PagedReady, usePagedRead } from "./use-paged-read.ts";

export type ProposalsReady = PagedReady<ProposalPage>;

export type ProposalsState = Paged<ProposalPage>;

export type Failure = "accept" | "reject";

const SILENT: Announcement = { text: "", failed: false };

export type Focus =
  | { readonly kind: "none" }
  | { readonly kind: "row"; readonly id: number }
  | { readonly kind: "heading" };

const NO_FOCUS: Focus = { kind: "none" };

export function focusAfterLeaving(state: Readonly<ProposalsState>, id: number): Focus {
  if (state.status !== "ready") return { kind: "heading" };

  const at = state.proposals.findIndex((each) => each.id === id);
  const next = state.proposals[at + 1] ?? state.proposals[at - 1];

  return next === undefined ? { kind: "heading" } : { kind: "row", id: next.id };
}

function withMoreProposals(shown: Readonly<ProposalPage>, added: Readonly<ProposalPage>) {
  return { ...added, proposals: [...shown.proposals, ...added.proposals] };
}

export function reachesBelow(boundary: number) {
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

function applying(page: Readonly<ProposalPage>, id: number): ProposalPage {
  return {
    ...page,
    proposals: page.proposals.map((each) =>
      each.id === id ? { ...each, state: "accepting" as const } : each,
    ),
  };
}

interface Settling {
  readonly reread: (
    through: (page: Readonly<ProposalPage>) => boolean,
  ) => Promise<ProposalPage | null>;
  readonly lastLoaded: () => number;
  readonly setFailed: Dispatch<SetStateAction<ReadonlyMap<number, Failure>>>;
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
    async (proposal: Readonly<Proposal>, failure: Failure) => {
      const page = await reread(reachesBelow(lastLoaded()));
      const now = page?.proposals.find(({ id }) => id === proposal.id);

      if (page !== null && now === undefined) {
        setNotice(PROPOSAL_WORDS.alreadyDecided);
        say(PROPOSAL_WORDS.alreadyDecided);
        setFocus({ kind: "heading" });

        return;
      }

      if (now?.state !== "accepting") setFailed((was) => new Map(was).set(proposal.id, failure));
    },
    [lastLoaded, reread, say, setFailed, setFocus, setNotice],
  );
}

function withoutId(ids: Readonly<ReadonlySet<number>>, id: number): ReadonlySet<number> {
  return new Set([...ids].filter((each) => each !== id));
}

function withoutFailure(
  failures: Readonly<ReadonlyMap<number, Failure>>,
  id: number,
): ReadonlyMap<number, Failure> {
  return new Map([...failures].filter(([each]) => each !== id));
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

function useAccept({
  settle,
  leave,
  edit,
  say,
}: Readonly<{
  settle: (proposal: Readonly<Proposal>, failure: Failure) => Promise<void>;
  leave: (proposal: Readonly<Proposal>) => Promise<void>;
  edit: Leaving["edit"];
  say: (text: string) => void;
}>) {
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());

  const accept = useCallback(
    async (proposal: Readonly<Proposal>) => {
      setBusy((was) => withoutId(was, proposal.id));

      const outcome = await sendAccept(proposal.id);

      if (outcome === "done") {
        await leave(proposal);
        say(acceptedAnnouncement(proposal.from.name, proposal.into.name));
      } else if (outcome === "accepting") {
        edit((page) => applying(page, proposal.id));
      } else if (outcome === "busy") {
        setBusy((was) => new Set(was).add(proposal.id));
      } else {
        await settle(proposal, "accept");
      }
    },
    [edit, leave, say, settle],
  );

  return { accept, busy };
}

function useRowFlags() {
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [failed, setFailed] = useState<ReadonlyMap<number, Failure>>(new Map());
  const [focus, setFocus] = useState(NO_FOCUS);
  const [announcement, setAnnouncement] = useState<Announcement>(SILENT);
  const [notice, setNotice] = useState<string | null>(null);

  const say = useCallback((text: string) => {
    setAnnouncement({ text, failed: false });
  }, []);

  const start = useCallback((proposal: Readonly<Proposal>) => {
    setPending((was) => new Set(was).add(proposal.id));
    setNotice(null);
    setFailed((was) => withoutFailure(was, proposal.id));
  }, []);

  const finish = useCallback((proposal: Readonly<Proposal>) => {
    setPending((was) => withoutId(was, proposal.id));
  }, []);

  const focused = useCallback(() => {
    setFocus(NO_FOCUS);
  }, []);

  return {
    flags: { pending, failed, announcement, notice, focus },
    controls: { setFailed, setFocus, setNotice, say, start, finish, focused },
  };
}

function useLastLoaded(latest: Readonly<RefObject<Readonly<ProposalsState>>>) {
  return useCallback(() => {
    const current = latest.current;

    return current.status === "ready" ? (current.proposals.at(-1)?.id ?? 0) : 0;
  }, [latest]);
}

export function useProposalsPage() {
  const source = usePagedRead(fetchProposals, withMoreProposals);
  const { state, edit, reread } = source;
  const latest = useLatest(state);
  const { flags, controls } = useRowFlags();
  const { setFailed, setFocus, setNotice, say, start, finish, focused } = controls;
  const lastLoaded = useLastLoaded(latest);

  const settle = useSettle({ reread, lastLoaded, setFailed, setFocus, say, setNotice });
  const leave = useLeave({ latest, edit, reread, setFocus });
  const { accept, busy } = useAccept({ settle, leave, edit, say });
  const refresh = useCallback(() => reread(reachesBelow(lastLoaded())), [lastLoaded, reread]);

  const gone = useCallback(
    (rows: readonly Proposal[], before: Readonly<ProposalsState>) => {
      rows.forEach(({ from, into }) => {
        say(acceptedAnnouncement(from.name, into.name));
      });

      const [first] = rows;

      if (first !== undefined) setFocus(focusAfterLeaving(before, first.id));
    },
    [say, setFocus],
  );

  useAcceptingPoll({ applying: applyingRows(state).length > 0, latest, refresh, gone });

  const decide = useCallback(
    async (proposal: Readonly<Proposal>, action: "accept" | "reject") => {
      start(proposal);

      if (action === "accept") {
        await accept(proposal);
      } else if ((await sendReject(proposal.id)) === "rejected") {
        await leave(proposal);
        say(rejectedAnnouncement(proposal.from.name, proposal.into.name));
      } else {
        await settle(proposal, "reject");
      }

      finish(proposal);
    },
    [accept, finish, leave, say, settle, start],
  );

  return { source, ...flags, busy, focused, decide };
}
