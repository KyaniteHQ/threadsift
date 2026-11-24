import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";

import type {
  Overview,
  TopicItem,
  TopicPage,
} from "../../src/core/contract/topic-overview-contract.ts";
import { fetchTopicPage, retryTopicOverview } from "./api.ts";
import { type More, newer } from "./list-paging.ts";
import { readThrough } from "./read-through.ts";
import type { Route } from "./routing.ts";
import { useGuard } from "./use-form.ts";
import { useLatest } from "./use-latest.ts";
import { usePolling } from "./use-polling.ts";
import { useSurvivorAddress } from "./use-survivor-address.ts";
import { type Ticket, useTicket } from "./use-ticket.ts";

export interface TopicReady {
  readonly status: "ready";
  readonly topic: TopicPage["topic"];
  readonly overview: Overview;
  readonly disagreements: TopicPage["disagreements"];
  readonly items: readonly TopicItem[];
  readonly next: string | null;
  readonly more: More;
}

export type TopicState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "missing" }
  | TopicReady;

const LOADING: TopicState = { status: "loading" };

const FAILED: TopicState = { status: "failed" };

const MISSING: TopicState = { status: "missing" };

function readyFrom(page: Readonly<TopicPage>): TopicReady {
  return { status: "ready", ...page, more: "idle" };
}

async function attempt(key: string, cursor: string | null, signal: AbortSignal) {
  try {
    return await fetchTopicPage(key, cursor, signal);
  } catch {
    return null;
  }
}

function foundPage(read: Awaited<ReturnType<typeof fetchTopicPage>>): TopicPage | null {
  return read.outcome === "found" ? read.page : null;
}

function reaches(page: Readonly<TopicPage>, last: Readonly<TopicItem> | undefined): boolean {
  const end = page.items.at(-1);

  return last === undefined || end === undefined || !newer(end, last);
}

function joined(shown: Readonly<TopicPage>, added: Readonly<TopicPage>): TopicPage {
  return { ...added, items: [...shown.items, ...added.items] };
}

async function freshRead(
  key: string,
  { last, signal }: Readonly<{ last: Readonly<TopicItem> | undefined; signal: AbortSignal }>,
) {
  try {
    const first = foundPage(await fetchTopicPage(key, null, signal));

    return first === null
      ? null
      : await readThrough(first, {
          read: async (cursor) => foundPage(await fetchTopicPage(key, cursor, signal)),
          joined,
          covers: (shown) => reaches(shown, last),
        });
  } catch {
    return null;
  }
}

function appended(now: TopicState, page: Readonly<TopicPage> | null): TopicState {
  if (now.status !== "ready") return now;

  return page === null
    ? { ...now, more: "failed" }
    : { ...now, items: [...now.items, ...page.items], next: page.next, more: "idle" };
}

type SetState = Dispatch<SetStateAction<TopicState>>;

function useFirstRead(key: string, setState: SetState, ticket: Ticket) {
  return useCallback(async () => {
    const mine = ticket.take();
    const read = await attempt(key, null, ticket.signal());

    if (!ticket.matches(mine)) return;

    if (read === null) setState(FAILED);
    else setState(read.outcome === "missing" ? MISSING : readyFrom(read.page));
  }, [key, setState, ticket]);
}

function useLoadMore(
  key: string,
  { setState, ticket, state }: Readonly<{ setState: SetState; ticket: Ticket; state: TopicState }>,
) {
  const latest = useLatest(state);

  return useCallback((): void => {
    const current = latest.current;

    if (current.status !== "ready" || current.next === null || current.more === "loading") return;

    const mine = ticket.now();
    setState({ ...current, more: "loading" });

    void attempt(key, current.next, ticket.signal()).then((read) => {
      if (ticket.matches(mine)) {
        setState((now) => appended(now, read?.outcome === "found" ? read.page : null));
      }

      return read;
    });
  }, [key, latest, setState, ticket]);
}

function applyRefresh(
  now: TopicState,
  { page, loaded }: Readonly<{ page: Readonly<TopicPage>; loaded: Readonly<TopicReady> }>,
): TopicState {
  const unchanged =
    now.status === "ready" &&
    now.more !== "loading" &&
    now.next === loaded.next &&
    now.items.length === loaded.items.length;

  return unchanged ? { ...now, ...page } : now;
}

function useOverviewPoll(
  key: string,
  { setState, ticket, state }: Readonly<{ setState: SetState; ticket: Ticket; state: TopicState }>,
) {
  const latest = useLatest(state);
  const pending = state.status === "ready" && state.overview.state === "pending";

  usePolling(pending, async () => {
    const loaded = latest.current;
    const mine = ticket.now();

    if (loaded.status !== "ready" || loaded.more === "loading") return;

    const page = await freshRead(key, { last: loaded.items.at(-1), signal: ticket.signal() });

    if (page !== null && ticket.matches(mine)) {
      setState((now) => applyRefresh(now, { page, loaded }));
    }
  });
}

function useWriteOverview(key: string, setState: SetState, reload: () => Promise<void>) {
  const { guard } = useGuard();

  return useCallback((): void => {
    guard(async () => {
      try {
        const overview = await retryTopicOverview(key);

        if (overview === null) await reload();
        else setState((now) => (now.status === "ready" ? { ...now, overview } : now));
      } catch {
        await reload();
      }
    });
  }, [guard, key, reload, setState]);
}

export function useTopicPage(key: string, replace: Route["replace"]) {
  const [state, setState] = useState<TopicState>(LOADING);
  const ticket = useTicket();
  const first = useFirstRead(key, setState, ticket);
  const loadMore = useLoadMore(key, { setState, ticket, state });
  const writeOverview = useWriteOverview(key, setState, first);

  useEffect(() => {
    void first();

    return () => {
      ticket.take();
    };
  }, [first, ticket]);

  const retry = useCallback((): void => {
    setState(LOADING);
    void first();
  }, [first]);

  useOverviewPoll(key, { setState, ticket, state });
  useSurvivorAddress(state.status === "ready" ? state.topic.key : null, key, replace);

  return { state, retry, loadMore, writeOverview };
}
