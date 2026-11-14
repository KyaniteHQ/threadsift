import { type Dispatch, type RefObject, type SetStateAction, useCallback, useState } from "react";

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

interface Press {
  readonly id: number;
  readonly says: (page: Readonly<ProposalPage> | null) => string | null;
}

interface Settling {
  readonly reread: (
    through: (page: Readonly<ProposalPage>) => boolean,
    press?: Readonly<Press>,
  ) => Promise<ProposalPage | null>;
  readonly lastLoaded: () => number;
  readonly send: RowSend;
  readonly setFocus: Dispatch<SetStateAction<Focus>>;
  readonly setNotice: (text: string | null) => void;
}

function hasLeft(page: Readonly<ProposalPage> | null, id: number): page is ProposalPage {
  return page !== null && !page.proposals.some((each) => each.id === id);
}

function useSettle({ reread, lastLoaded, send, setFocus, setNotice }: Readonly<Settling>) {
  return useCallback(
    async (proposal: Readonly<Proposal>, failure: Failure, goneNote: string) => {
      const page = await reread(reachesBelow(lastLoaded()), {
        id: proposal.id,
        says: (read) => (hasLeft(read, proposal.id) ? goneNote : null),
      });

      const now = page?.proposals.find(({ id }) => id === proposal.id);

      if (hasLeft(page, proposal.id)) {
        setNotice(goneNote);
        setFocus({ kind: "heading" });

        return;
      }

      if (now?.state !== "accepting") send({ kind: "fail", id: proposal.id, failure });
    },
    [lastLoaded, reread, send, setFocus, setNotice],
  );
}

interface Leaving {
  readonly latest: Readonly<RefObject<Readonly<ProposalsState>>>;
  readonly edit: (change: (page: Readonly<ProposalPage>) => ProposalPage) => void;
  readonly reread: Settling["reread"];
  readonly lastLoaded: Settling["lastLoaded"];
  readonly retry: () => void;
  readonly setFocus: Dispatch<SetStateAction<Focus>>;
  readonly say: (text: string) => void;
}

type Departure = "rejected" | "accepted";

function useLeave({ latest, edit, reread, lastLoaded, retry, setFocus, say }: Readonly<Leaving>) {
  return useCallback(
    async (proposal: Readonly<Proposal>, departure: Departure, says: string) => {
      const next = focusAfterLeaving(latest.current, proposal.id);

      setFocus(next);

      const onlyRow = onlyRowOfMore(latest.current, proposal.id);

      const through =
        departure === "accepted" ? reachesBelow(lastLoaded()) : onlyRow ? () => true : null;

      if (through === null) {
        say(says);
        edit((page) => without(page, proposal.id));

        return;
      }

      const reloaded = await reread(through, { id: proposal.id, says: () => says });

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
    [edit, lastLoaded, latest, reread, retry, say, setFocus],
  );
}

function useAccept({
  settle,
  leave,
  edit,
  send,
}: Readonly<{
  settle: (proposal: Readonly<Proposal>, failure: Failure, goneNote: string) => Promise<void>;
  leave: (proposal: Readonly<Proposal>, departure: Departure, says: string) => Promise<void>;
  edit: Leaving["edit"];
  send: RowSend;
}>) {
  return useCallback(
    async (proposal: Readonly<AcceptableProposal>) => {
      const outcome = await sendAccept(proposal.id);

      if (outcome === "done") {
        await leave(proposal, "accepted", acceptedAnnouncement(proposal));
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
    [edit, leave, send, settle],
  );
}

function useRowFlags() {
  const { rowFor, send } = useProposalRows();
  const [focus, setFocus] = useState(NO_FOCUS);
  const [announcement, setAnnouncement] = useState<Announcement>(SILENT);
  const [notice, setNotice] = useState<string | null>(null);

  const say = useCallback((text: string) => {
    setAnnouncement({ text, failed: false });
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
  page: Readonly<ProposalPage> | null,
  pressed: number | undefined,
): readonly AcceptableProposal[] {
  return applyingRows(before).filter(({ id }) => id !== pressed && hasLeft(page, id));
}

function useAnnouncingReread(
  reread: (through: (page: Readonly<ProposalPage>) => boolean) => Promise<ProposalPage | null>,
  latest: Readonly<RefObject<Readonly<ProposalsState>>>,
  announce: Readonly<{
    say: (text: string) => void;
    setFocus: Dispatch<SetStateAction<Focus>>;
  }>,
) {
  const { say, setFocus } = announce;

  return useCallback(
    async (through: (page: Readonly<ProposalPage>) => boolean, press?: Readonly<Press>) => {
      const before = latest.current;
      const page = await reread(through);
      const left = leftRows(before, page, press?.id);
      const own = press?.says(page) ?? null;

      const texts = [
        ...(own === null ? [] : [own]),
        ...left.map((row) => acceptedAnnouncement(row)),
      ];

      const [first] = left;

      if (texts.length > 0) say(texts.join(" "));

      if (first !== undefined && press === undefined) setFocus(focusAfterLeaving(before, first.id));

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

  const settle = useSettle({ reread, lastLoaded, send, setFocus, setNotice });
  const leave = useLeave({ latest, edit, reread, lastLoaded, retry, setFocus, say });
  const accept = useAccept({ settle, leave, edit, send });

  const refresh = useCallback(async () => {
    await reread(reachesBelow(lastLoaded()));
  }, [lastLoaded, reread]);

  usePolling(applyingRows(state).length > 0, refresh);

  const press = usePresses({ send, setNotice, accept, settle, leave });

  return { source, ...flags, focused, press };
}
