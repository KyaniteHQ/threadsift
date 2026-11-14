import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";

import type { Proposal, ProposalPage } from "../../src/core/proposal-contract.ts";
import { type Failure, fetchProposals, isBusy, sendAccept } from "./proposals-api.ts";
import {
  type AcceptableProposal,
  PROPOSAL_WORDS,
  acceptedAnnouncement,
  isAcceptable,
  notCurrentNote,
} from "./proposals-text.ts";
import type { Announcement } from "./use-announcement.ts";
import { useLatest } from "./use-latest.ts";
import { type Paged, usePagedRead } from "./use-paged-read.ts";
import { usePolling } from "./use-polling.ts";
import { usePresses } from "./use-proposal-presses.ts";
import { useProposalRows } from "./use-proposal-rows.ts";

type RowSend = ReturnType<typeof useProposalRows>["send"];

type ProposalsState = Paged<ProposalPage>;

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
  readonly send: RowSend;
  readonly setFocus: Dispatch<SetStateAction<Focus>>;
  readonly say: (text: string) => void;
  readonly setNotice: (text: string | null) => void;
}

function useSettle({ reread, lastLoaded, send, setFocus, say, setNotice }: Readonly<Settling>) {
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

      if (now?.state !== "accepting") send({ kind: "fail", id: proposal.id, failure });
    },
    [lastLoaded, reread, say, send, setFocus, setNotice],
  );
}

interface Leaving {
  readonly latest: Readonly<RefObject<Readonly<ProposalsState>>>;
  readonly edit: (change: (page: Readonly<ProposalPage>) => ProposalPage) => void;
  readonly reread: Settling["reread"];
  readonly lastLoaded: Settling["lastLoaded"];
  readonly retry: () => void;
  readonly setFocus: Dispatch<SetStateAction<Focus>>;
}

type Departure = "rejected" | "accepted";

function useLeave({ latest, edit, reread, lastLoaded, retry, setFocus }: Readonly<Leaving>) {
  return useCallback(
    async (proposal: Readonly<Proposal>, departure: Departure) => {
      const next = focusAfterLeaving(latest.current, proposal.id);

      setFocus(next);

      const onlyRow = onlyRowOfMore(latest.current, proposal.id);

      const through =
        departure === "accepted" ? reachesBelow(lastLoaded()) : onlyRow ? () => true : null;

      const reloaded = through === null ? null : await reread(through);

      if (reloaded === null) {
        if (onlyRow) retry();
        else edit((page) => without(page, proposal.id));

        return;
      }

      const [first] = reloaded.proposals;
      const stays = next.kind === "row" && reloaded.proposals.some(({ id }) => id === next.id);

      if (stays) setFocus(next);
      else setFocus(first === undefined ? { kind: "heading" } : { kind: "row", id: first.id });
    },
    [edit, lastLoaded, latest, reread, retry, setFocus],
  );
}

function useAccept({
  settle,
  leave,
  edit,
  send,
  say,
}: Readonly<{
  settle: (proposal: Readonly<Proposal>, failure: Failure, goneNote: string) => Promise<void>;
  leave: (proposal: Readonly<Proposal>, departure: Departure) => Promise<void>;
  edit: Leaving["edit"];
  send: RowSend;
  say: (text: string) => void;
}>) {
  return useCallback(
    async (proposal: Readonly<AcceptableProposal>) => {
      const outcome = await sendAccept(proposal.id);

      if (outcome === "done") {
        await leave(proposal, "accepted");
        say(acceptedAnnouncement(proposal));
      } else if (outcome === "accepting") {
        edit((page) => applying(page, proposal.id));
      } else if (isBusy(outcome)) {
        send({ kind: "hold", id: proposal.id, busy: outcome });
      } else if (outcome === "not-current") {
        await settle(proposal, "accept", notCurrentNote(proposal));
      } else {
        await settle(proposal, "accept", PROPOSAL_WORDS.alreadyDecided);
      }
    },
    [edit, leave, say, send, settle],
  );
}

function useRowFlags() {
  const { rowFor, send } = useProposalRows();
  const [focus, setFocus] = useState(NO_FOCUS);
  const [announcement, setAnnouncement] = useState<Announcement>(SILENT);
  const [notice, setNotice] = useState<string | null>(null);
  const spoken = useRef<string[]>([]);

  const say = useCallback((text: string) => {
    spoken.current.push(text);
    setAnnouncement({ text: spoken.current.join(" "), failed: false });

    setTimeout(() => {
      spoken.current = [];
    }, 0);
  }, []);

  const focused = useCallback(() => {
    setFocus(NO_FOCUS);
  }, []);

  return {
    flags: { rowFor, announcement, notice, focus },
    controls: { send, setFocus, setNotice, say, focused },
  };
}

function useLastLoaded(latest: Readonly<RefObject<Readonly<ProposalsState>>>) {
  return useCallback(() => {
    const current = latest.current;

    return current.status === "ready" ? (current.proposals.at(-1)?.id ?? 0) : 0;
  }, [latest]);
}

function applyingRows(state: Readonly<ProposalsState>): readonly AcceptableProposal[] {
  return state.status === "ready"
    ? state.proposals.filter(isAcceptable).filter(({ state: each }) => each === "accepting")
    : [];
}

function leftRows(
  before: Readonly<ProposalsState>,
  page: Readonly<ProposalPage>,
): readonly AcceptableProposal[] {
  return applyingRows(before).filter(({ id }) => !page.proposals.some((each) => each.id === id));
}

function useAnnouncingReread(
  reread: Settling["reread"],
  latest: Readonly<RefObject<Readonly<ProposalsState>>>,
  announce: Readonly<Pick<Settling, "say" | "setFocus">>,
) {
  const { say, setFocus } = announce;

  return useCallback(
    async (through: (page: Readonly<ProposalPage>) => boolean) => {
      const before = latest.current;
      const page = await reread(through);
      const [first, ...others] = page === null ? [] : leftRows(before, page);

      if (first !== undefined) {
        say([first, ...others].map((row) => acceptedAnnouncement(row)).join(" "));
        setFocus(focusAfterLeaving(before, first.id));
      }

      return page;
    },
    [latest, reread, say, setFocus],
  );
}

export function useProposalsPage() {
  const source = usePagedRead(fetchProposals, withMoreProposals);
  const { state, edit, reread: rawReread, retry } = source;
  const latest = useLatest(state);
  const { flags, controls } = useRowFlags();
  const { send, setFocus, setNotice, say, focused } = controls;
  const reread = useAnnouncingReread(rawReread, latest, { say, setFocus });
  const lastLoaded = useLastLoaded(latest);

  const settle = useSettle({ reread, lastLoaded, send, setFocus, say, setNotice });
  const leave = useLeave({ latest, edit, reread, lastLoaded, retry, setFocus });
  const accept = useAccept({ settle, leave, edit, send, say });

  const refresh = useCallback(async () => {
    await reread(reachesBelow(lastLoaded()));
  }, [lastLoaded, reread]);

  usePolling(applyingRows(state).length > 0, refresh);

  const press = usePresses({ send, setNotice, accept, settle, leave, say });

  return { source, ...flags, focused, press };
}
