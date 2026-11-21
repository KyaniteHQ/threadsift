import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { More } from "./list-paging.ts";
import { useLatest } from "./use-latest.ts";
import { type Ticket, useTicket } from "./use-ticket.ts";

export interface PagedPage {
  readonly next: string | null;
}

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

async function attempt<Page>(
  read: (cursor: string | null) => Promise<Page>,
  cursor: string | null,
): Promise<Page | null> {
  try {
    return await read(cursor);
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

async function readThrough<Page extends PagedPage>(
  read: (cursor: string | null) => Promise<Page>,
  joined: (shown: Readonly<Page>, added: Readonly<Page>) => Page,
  covers: (shown: Readonly<Page>) => boolean,
  shown: Readonly<Page>,
): Promise<Page | null> {
  if (shown.next === null || covers(shown)) return shown;

  const added = await attempt(read, shown.next);

  return added === null ? null : readThrough(read, joined, covers, joined(shown, added));
}

async function reloaded<Page extends PagedPage>(
  read: (cursor: string | null) => Promise<Page>,
  joined: (shown: Readonly<Page>, added: Readonly<Page>) => Page,
  covers: (shown: Readonly<Page>) => boolean,
): Promise<Page | null> {
  const first = await attempt(read, null);

  return first === null ? null : readThrough(read, joined, covers, first);
}

async function firstRead<Page extends PagedPage>(
  read: (cursor: string | null) => Promise<Page>,
  ticket: Ticket,
  setState: Dispatch<SetStateAction<Paged<Page>>>,
): Promise<void> {
  const mine = ticket.take();
  const page = await attempt(read, null);

  if (ticket.matches(mine)) setState(page === null ? FAILED : readyFrom(page));
}

function useFirstRead<Page extends PagedPage>(
  read: (cursor: string | null) => Promise<Page>,
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
  read: (cursor: string | null) => Promise<Page>,
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

      const mine = ticket.now();
      const page = await reloaded(read, joined, (shown) => covers(shown, loaded));

      if (page === null || !ticket.matches(mine)) return;

      setState((now) => (now.status === "ready" ? { ...readyFrom(page), more: now.more } : now));
    },
    [joined, latest, read, reloading, ticket],
  );

  const loadMore = useCallback((): boolean => {
    const current = latest.current;

    if (current.status !== "ready" || current.next === null || current.more === "loading") {
      return false;
    }

    const mine = ticket.take();
    setState({ ...current, more: "loading" });

    void attempt(read, current.next).then((page) => {
      if (ticket.matches(mine)) setState((now) => appended(now, page, joined));

      return page;
    });

    return true;
  }, [joined, latest, read, ticket]);

  return { state, retry, refresh, loadMore };
}
