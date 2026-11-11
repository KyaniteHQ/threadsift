import { useCallback, useEffect, useRef, useState } from "react";

import type { More } from "./LoadMore.tsx";
import { useLatest } from "./use-latest.ts";

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

export function usePagedRead<Page extends PagedPage>(
  read: (cursor: string | null) => Promise<Page>,
  joined: (shown: Readonly<Page>, added: Readonly<Page>) => Page,
) {
  const [state, setState] = useState<Paged<Page>>(LOADING);
  const ticket = useRef(0);
  const latest = useLatest(state);

  const first = useCallback(async () => {
    ticket.current += 1;
    const mine = ticket.current;
    const page = await attempt(read, null);

    if (ticket.current === mine) setState(page === null ? FAILED : readyFrom(page));
  }, [read]);

  useEffect(() => {
    void first();
  }, [first]);

  const retry = useCallback(() => {
    setState(LOADING);
    void first();
  }, [first]);

  const loadMore = useCallback((): void => {
    const current = latest.current;

    if (current.status !== "ready" || current.next === null || current.more === "loading") return;

    ticket.current += 1;
    const mine = ticket.current;
    setState({ ...current, more: "loading" });

    void attempt(read, current.next).then((page) => {
      if (ticket.current === mine) setState((now) => appended(now, page, joined));

      return page;
    });
  }, [joined, latest, read]);

  return { state, retry, loadMore };
}
