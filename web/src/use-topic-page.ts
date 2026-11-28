import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";

import type {
  Overview,
  TopicItem,
  TopicPage,
} from "../../src/core/contract/topic-overview-contract.ts";
import { type TopicRead, fetchTopicPage, retryTopicOverview } from "./api.ts";
import { type More, reaches } from "./list-paging.ts";
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

function attempt(key: string, cursor: string | null, signal: AbortSignal) {
  return fetchTopicPage(key, cursor, signal).catch(() => null);
}

function foundPage(read: TopicRead | null): TopicPage | null {
  return read?.outcome === "found" ? read.page : null;
}

function joined(shown: Readonly<TopicPage>, added: Readonly<TopicPage>): TopicPage {
  return { ...added, items: [...shown.items, ...added.items] };
}

async function freshRead(
  key: string,
  { last, signal }: Readonly<{ last: Readonly<TopicItem> | undefined; signal: AbortSignal }>,
) {
  const first = foundPage(await fetchTopicPage(key, null, signal));

  return first === null
    ? null
    : readThrough(first, {
        read: async (cursor) => foundPage(await fetchTopicPage(key, cursor, signal)),
        joined,
        covers: (shown) => reaches(shown, last),
      });
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
    const signal = ticket.take();
    const read = await attempt(key, null, signal);

    if (signal.aborted) return;

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

    const signal = ticket.current();
    setState({ ...current, more: "loading" });

    void attempt(key, current.next, signal).then((read) => {
      if (!signal.aborted) setState((now) => appended(now, foundPage(read)));

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
    const signal = ticket.current();

    if (loaded.status !== "ready" || loaded.more === "loading") return;

    const page = await freshRead(key, { last: loaded.items.at(-1), signal }).catch(() => null);

    if (page !== null && !signal.aborted) {
      setState((now) => applyRefresh(now, { page, loaded }));
    }
  });
}

function useWriteOverview(
  key: string,
  {
    setState,
    state,
    reload,
  }: Readonly<{ setState: SetState; state: TopicState; reload: () => Promise<void> }>,
) {
  const { guard } = useGuard();
  const [refusedFor, setRefusedFor] = useState<Overview | null>(null);
  const latest = useLatest(state);

  const write = useCallback((): void => {
    guard(async () => {
      setRefusedFor(null);

      const settle = (retry: Awaited<ReturnType<typeof retryTopicOverview>>): Promise<void> => {
        switch (retry.kind) {
          case "started":
            setState((now) =>
              now.status === "ready" ? { ...now, overview: retry.overview } : now,
            );

            return Promise.resolve();
          case "restoring":
            if (latest.current.status === "ready") setRefusedFor(latest.current.overview);

            return Promise.resolve();
          case "refused":
            return reload();
          default: {
            const exhaustive: never = retry;

            return exhaustive;
          }
        }
      };

      try {
        await settle(await retryTopicOverview(key));
      } catch {
        await reload();
      }
    });
  }, [guard, key, latest, reload, setState]);

  return { write, refused: state.status === "ready" && state.overview === refusedFor };
}

export function useTopicPage(key: string, replace: Route["replace"]) {
  const [state, setState] = useState<TopicState>(LOADING);
  const ticket = useTicket();
  const first = useFirstRead(key, setState, ticket);
  const loadMore = useLoadMore(key, { setState, ticket, state });
  const { write: writeOverview, refused: writeRefused } = useWriteOverview(key, {
    setState,
    state,
    reload: first,
  });

  useEffect(() => {
    void first();
  }, [first]);

  const retry = useCallback((): void => {
    setState(LOADING);
    void first();
  }, [first]);

  useOverviewPoll(key, { setState, ticket, state });
  useSurvivorAddress(state.status === "ready" ? state.topic.key : null, key, replace);

  return { state, retry, loadMore, writeOverview, writeRefused };
}
