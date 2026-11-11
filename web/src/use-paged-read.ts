import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

async function readThrough<Page extends PagedPage>(
  read: (cursor: string | null) => Promise<Page>,
  joined: (shown: Readonly<Page>, added: Readonly<Page>) => Page,
  {
    cursor,
    through,
  }: Readonly<{ cursor: string | null; through: (page: Readonly<Page>) => boolean }>,
): Promise<Page | null> {
  const page = await attempt(read, cursor);

  if (page === null || page.next === null || through(page)) return page;

  const rest = await readThrough(read, joined, { cursor: page.next, through });

  return rest === null ? null : joined(page, rest);
}

interface Ticket {
  readonly take: () => number;
  readonly matches: (mine: number) => boolean;
}

function useTicket(): Ticket {
  const count = useRef(0);

  return useMemo(
    () => ({
      take: () => {
        count.current += 1;

        return count.current;
      },
      matches: (mine) => count.current === mine,
    }),
    [],
  );
}

const REREADS = 3;

interface Rewrites<Page extends PagedPage> {
  readonly read: (cursor: string | null) => Promise<Page>;
  readonly joined: (shown: Readonly<Page>, added: Readonly<Page>) => Page;
  readonly ticket: Ticket;
  readonly setState: Dispatch<SetStateAction<Paged<Page>>>;
}

function loadFailed<Page extends PagedPage>(now: Paged<Page>): Paged<Page> {
  return now.status === "ready" && now.more === "loading" ? { ...now, more: "failed" } : now;
}

function useRewrites<Page extends PagedPage>({
  read,
  joined,
  ticket,
  setState,
}: Readonly<Rewrites<Page>>) {
  const edit = useCallback(
    (change: (page: Readonly<Page>) => Page): void => {
      ticket.take();
      setState((now) => (now.status === "ready" ? readyFrom(change(now)) : now));
    },
    [setState, ticket],
  );

  const reread = useCallback(
    async function again(
      through: (page: Readonly<Page>) => boolean,
      left: number = REREADS,
    ): Promise<Page | null> {
      const mine = ticket.take();
      const page = await readThrough(read, joined, { cursor: null, through });

      if (!ticket.matches(mine)) return left > 1 ? again(through, left - 1) : null;

      setState(page === null ? loadFailed : readyFrom(page));

      return page;
    },
    [joined, read, setState, ticket],
  );

  return { edit, reread };
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

  const retry = useCallback(() => {
    setState(LOADING);
    void firstRead(read, ticket, setState);
  }, [read, ticket]);

  const loadMore = useCallback((): void => {
    const current = latest.current;

    if (current.status !== "ready" || current.next === null || current.more === "loading") return;

    const mine = ticket.take();
    setState({ ...current, more: "loading" });

    void attempt(read, current.next).then((page) => {
      if (ticket.matches(mine)) setState((now) => appended(now, page, joined));

      return page;
    });
  }, [joined, latest, read, ticket]);

  const { edit, reread } = useRewrites({ read, joined, ticket, setState });

  return { state, retry, loadMore, edit, reread };
}
