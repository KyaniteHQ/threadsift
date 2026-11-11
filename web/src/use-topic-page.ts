import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Overview, TopicItem, TopicPage } from "../../src/core/topic-overview-contract.ts";
import { fetchTopicPage, retryTopicOverview } from "./api.ts";
import type { More } from "./LoadMore.tsx";
import { useLatest } from "./use-latest.ts";

export const OVERVIEW_POLL_MS = 3000;

export interface TopicReady {
  readonly status: "ready";
  readonly topic: TopicPage["topic"];
  readonly overview: Overview;
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

async function attempt(key: string, cursor: string | null) {
  try {
    return await fetchTopicPage(key, cursor);
  } catch {
    return null;
  }
}

function refreshed(now: TopicReady, page: Readonly<TopicPage>): TopicReady {
  return { ...now, topic: page.topic, overview: page.overview, items: page.items, next: page.next };
}

function newer(a: Readonly<TopicItem>, b: Readonly<TopicItem>): boolean {
  return a.savedAt > b.savedAt || (a.savedAt === b.savedAt && a.id > b.id);
}

async function readThrough(
  key: string,
  last: Readonly<TopicItem> | undefined,
  page: Readonly<TopicPage>,
): Promise<TopicPage | null> {
  const end = page.items.at(-1);

  if (page.next === null || last === undefined || end === undefined || !newer(end, last)) {
    return page;
  }

  const more = await fetchTopicPage(key, page.next);

  if (more.outcome !== "found") return null;

  return readThrough(key, last, { ...more.page, items: [...page.items, ...more.page.items] });
}

async function freshRead(key: string, last: Readonly<TopicItem> | undefined) {
  try {
    const first = await fetchTopicPage(key, null);

    return first.outcome === "found" ? await readThrough(key, last, first.page) : null;
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

interface Ticket {
  readonly take: () => number;
  readonly now: () => number;
}

function useTicket(): Ticket {
  const count = useRef(0);

  return useMemo(
    () => ({
      take: () => {
        count.current += 1;

        return count.current;
      },
      now: () => count.current,
    }),
    [],
  );
}

function useFirstRead(key: string, setState: SetState, ticket: Ticket) {
  return useCallback(async () => {
    const mine = ticket.take();
    const read = await attempt(key, null);

    if (ticket.now() !== mine) return;

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

    void attempt(key, current.next).then((read) => {
      if (ticket.now() === mine) {
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

  return unchanged ? refreshed(now, page) : now;
}

function useOverviewPoll(
  key: string,
  { setState, ticket, state }: Readonly<{ setState: SetState; ticket: Ticket; state: TopicState }>,
) {
  const latest = useLatest(state);
  const pending = state.status === "ready" && state.overview.state === "pending";

  useEffect(() => {
    const timer = pending
      ? window.setInterval(() => {
          const loaded = latest.current;
          const mine = ticket.now();

          if (loaded.status !== "ready" || loaded.more === "loading") return;

          void freshRead(key, loaded.items.at(-1)).then((page) => {
            if (page !== null && ticket.now() === mine) {
              setState((now) => applyRefresh(now, { page, loaded }));
            }

            return page;
          });
        }, OVERVIEW_POLL_MS)
      : null;

    return () => {
      if (timer !== null) window.clearInterval(timer);
    };
  }, [key, latest, pending, setState, ticket]);
}

function useWriteOverview(key: string, setState: SetState, reload: () => Promise<void>) {
  return useCallback((): void => {
    const write = async () => {
      try {
        const overview = await retryTopicOverview(key);

        if (overview === null) await reload();
        else setState((now) => (now.status === "ready" ? { ...now, overview } : now));
      } catch {
        await reload();
      }
    };

    void write();
  }, [key, reload, setState]);
}

export function useTopicPage(key: string) {
  const [state, setState] = useState<TopicState>(LOADING);
  const ticket = useTicket();
  const first = useFirstRead(key, setState, ticket);
  const loadMore = useLoadMore(key, { setState, ticket, state });
  const writeOverview = useWriteOverview(key, setState, first);

  useEffect(() => {
    void first();
  }, [first]);

  const retry = useCallback((): void => {
    setState(LOADING);
    void first();
  }, [first]);

  useOverviewPoll(key, { setState, ticket, state });

  return { state, retry, loadMore, writeOverview };
}
