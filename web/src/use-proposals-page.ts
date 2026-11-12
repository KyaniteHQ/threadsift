import { type Dispatch, type RefObject, type SetStateAction, useCallback, useState } from "react";

import type { Proposal, ProposalPage } from "../../src/core/proposal-contract.ts";
import { type Busy, sendAccept, sendReject, fetchProposals } from "./proposals-api.ts";
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
    async (proposal: Readonly<Proposal>, failure: Failure, goneNote: string) => {
      const page = await reread(reachesBelow(lastLoaded()));
      const now = page?.proposals.find(({ id }) => id === proposal.id);

      if (page !== null && now === undefined) {
        setNotice(goneNote);
        say(goneNote);
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

function withoutKey<Value>(
  map: Readonly<ReadonlyMap<number, Value>>,
  id: number,
): ReadonlyMap<number, Value> {
  return new Map([...map].filter(([each]) => each !== id));
}

interface Leaving {
  readonly latest: Readonly<RefObject<Readonly<ProposalsState>>>;
  readonly edit: (change: (page: Readonly<ProposalPage>) => ProposalPage) => void;
  readonly reread: Settling["reread"];
  readonly lastLoaded: Settling["lastLoaded"];
  readonly setFocus: Dispatch<SetStateAction<Focus>>;
}

type Departure = "rejected" | "merged";

function useLeave({ latest, edit, reread, lastLoaded, setFocus }: Readonly<Leaving>) {
  return useCallback(
    async (proposal: Readonly<Proposal>, departure: Departure) => {
      const next = focusAfterLeaving(latest.current, proposal.id);

      setFocus(next);

      const through =
        departure === "merged"
          ? reachesBelow(lastLoaded())
          : onlyRowOfMore(latest.current, proposal.id)
            ? () => true
            : null;

      const reloaded = through === null ? null : await reread(through);

      if (reloaded === null) {
        edit((page) => without(page, proposal.id));

        return;
      }

      const [first] = reloaded.proposals;
      const stays = next.kind === "row" && reloaded.proposals.some(({ id }) => id === next.id);

      if (!stays)
        setFocus(first === undefined ? { kind: "heading" } : { kind: "row", id: first.id });
    },
    [edit, lastLoaded, latest, reread, setFocus],
  );
}

function useAccept({
  settle,
  leave,
  edit,
  say,
}: Readonly<{
  settle: (proposal: Readonly<Proposal>, failure: Failure, goneNote: string) => Promise<void>;
  leave: (proposal: Readonly<Proposal>, departure: Departure) => Promise<void>;
  edit: Leaving["edit"];
  say: (text: string) => void;
}>) {
  const [busy, setBusy] = useState<ReadonlyMap<number, Busy>>(new Map());

  const accept = useCallback(
    async (proposal: Readonly<Proposal>) => {
      setBusy((was) => withoutKey(was, proposal.id));

      const outcome = await sendAccept(proposal.id);

      if (outcome === "done") {
        await leave(proposal, "merged");
        say(acceptedAnnouncement(proposal));
      } else if (outcome === "accepting") {
        edit((page) => applying(page, proposal.id));
      } else if (outcome === "merge-busy" || outcome === "topic-busy") {
        setBusy((was) => new Map(was).set(proposal.id, outcome));
      } else if (outcome === "not-current") {
        await settle(proposal, "accept", PROPOSAL_WORDS.notCurrent);
      } else {
        await settle(proposal, "accept", PROPOSAL_WORDS.alreadyDecided);
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
    setFailed((was) => withoutKey(was, proposal.id));
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
  const leave = useLeave({ latest, edit, reread, lastLoaded, setFocus });
  const { accept, busy } = useAccept({ settle, leave, edit, say });
  const refresh = useCallback(() => reread(reachesBelow(lastLoaded())), [lastLoaded, reread]);

  const gone = useCallback(
    (rows: readonly Proposal[], before: Readonly<ProposalsState>) => {
      rows.forEach((row) => {
        say(acceptedAnnouncement(row));
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
        await leave(proposal, "rejected");
        say(rejectedAnnouncement(proposal));
      } else {
        await settle(proposal, "reject", PROPOSAL_WORDS.alreadyDecided);
      }

      finish(proposal);
    },
    [accept, finish, leave, say, settle, start],
  );

  return { source, ...flags, busy, focused, decide };
}
