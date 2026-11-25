import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { More } from "./list-paging.ts";
import { type PagedPage, readThrough } from "./read-through.ts";
import { useLatest } from "./use-latest.ts";
import { type Ticket, useTicket } from "./use-ticket.ts";

export type PagedReady<Page extends PagedPage> = Page & {
  readonly status: "ready";
  readonly more: More;
};

export type Paged<Page extends PagedPage> =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | PagedReady<Page>;

const LOADING = { status: "loading" } as const;

const FAILED = { status: "failed" } as const;

function readyFrom<Page extends PagedPage>(page: Readonly<Page>): PagedReady<Page> {
  return { ...page, status: "ready", more: "idle" };
}

type Read<Page> = (cursor: string | null, signal: AbortSignal) => Promise<Page>;

async function attempt<Page>(
  read: Read<Page>,
  cursor: string | null,
  signal: AbortSignal,
): Promise<Page | null> {
  try {
    return await read(cursor, signal);
  } catch {
    return null;
  }
}

function appended<Page extends PagedPage>(
  now: Paged<Page>,
  page: Readonly<Page> | null,
  joined: (shown: Readonly<Page>, added: Readonly<Page>) => Page,
): Paged<Page> {
  if (now.status !== "ready") return now;

  return page === null ? { ...now, more: "failed" } : readyFrom(joined(now, page));
}

async function reloaded<Page extends PagedPage>(
  read: Read<Page>,
  joined: (shown: Readonly<Page>, added: Readonly<Page>) => Page,
  { covers, signal }: Readonly<{ covers: (shown: Readonly<Page>) => boolean; signal: AbortSignal }>,
): Promise<Page | null> {
  const first = await attempt(read, null, signal);

  return first === null
    ? null
    : readThrough(first, {
        read: (cursor) => attempt(read, cursor, signal),
        joined,
        covers,
      });
}

async function firstRead<Page extends PagedPage>(
  read: Read<Page>,
  ticket: Ticket,
  setState: Dispatch<SetStateAction<Paged<Page>>>,
): Promise<void> {
  const signal = ticket.take();
  const page = await attempt(read, null, signal);

  if (!signal.aborted) setState(page === null ? FAILED : readyFrom(page));
}

function useFirstRead<Page extends PagedPage>(
  read: Read<Page>,
  ticket: Ticket,
  setState: Dispatch<SetStateAction<Paged<Page>>>,
) {
  const reloading = useRef(0);

  useEffect(() => {
    void firstRead(read, ticket, setState);
  }, [read, setState, ticket]);

  const retry = useCallback(async () => {
    reloading.current += 1;
    setState((now) => (now.status === "ready" ? now : LOADING));

    try {
      await firstRead(read, ticket, setState);
    } finally {
      reloading.current -= 1;
    }
  }, [read, setState, ticket]);

  return { retry, reloading };
}

export function usePagedRead<Page extends PagedPage>(
  read: Read<Page>,
  joined: (shown: Readonly<Page>, added: Readonly<Page>) => Page,
) {
  const [state, setState] = useState<Paged<Page>>(LOADING);
  const ticket = useTicket();
  const latest = useLatest(state);

  const { retry, reloading } = useFirstRead(read, ticket, setState);

  const refresh = useCallback(
    async (covers: (shown: Readonly<Page>, loaded: Readonly<Page>) => boolean) => {
      const loaded = latest.current;

      if (loaded.status !== "ready" || loaded.more === "loading" || reloading.current > 0) return;

      const signal = ticket.current();
      const page = await reloaded(read, joined, {
        covers: (shown) => covers(shown, loaded),
        signal,
      });

      if (page === null || signal.aborted) return;

      setState((now) => (now.status === "ready" ? { ...readyFrom(page), more: now.more } : now));
    },
    [joined, latest, read, reloading, ticket],
  );

  const loadMore = useCallback((): boolean => {
    const current = latest.current;

    if (current.status !== "ready" || current.next === null || current.more === "loading") {
      return false;
    }

    const signal = ticket.take();
    setState({ ...current, more: "loading" });

    void attempt(read, current.next, signal).then((page) => {
      if (!signal.aborted) setState((now) => appended(now, page, joined));

      return page;
    });

    return true;
  }, [joined, latest, read, ticket]);

  return { state, retry, refresh, loadMore };
}
