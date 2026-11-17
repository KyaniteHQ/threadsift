import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";

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

async function firstRead<Page extends PagedPage>(
  read: (cursor: string | null) => Promise<Page>,
  ticket: Ticket,
  setState: Dispatch<SetStateAction<Paged<Page>>>,
  keepOnFailure = false,
): Promise<void> {
  const mine = ticket.take();
  const page = await attempt(read, null);

  if (ticket.matches(mine)) {
    setState((now) =>
      page === null ? (keepOnFailure && now.status === "ready" ? now : FAILED) : readyFrom(page),
    );
  }
}

export function usePagedRead<Page extends PagedPage>(
  read: (cursor: string | null) => Promise<Page>,
  joined: (shown: Readonly<Page>, added: Readonly<Page>) => Page,
) {
  const [state, setState] = useState<Paged<Page>>(LOADING);
  const ticket = useTicket();
  const latest = useLatest(state);

  useEffect(() => {
    void firstRead(read, ticket, setState);
  }, [read, ticket]);

  const retry = useCallback(
    async (keepOnFailure = false) => {
      setState((now) => (now.status === "ready" ? now : LOADING));
      await firstRead(read, ticket, setState, keepOnFailure);
    },
    [read, ticket],
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

  return { state, retry, loadMore };
}
