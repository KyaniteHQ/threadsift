import { useCallback, useEffect, useRef, useState } from "react";

import type { More } from "./list-paging.ts";
import { type PagedPage, readThrough } from "./read-through.ts";
import { type Ticket, useTicket } from "./use-ticket.ts";

export type PagedReady<Page extends PagedPage> = Page & {
  readonly status: "ready";
  readonly more: More;
  readonly rereading: boolean;
};

export type Paged<Page extends PagedPage> =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | PagedReady<Page>;

const LOADING = { status: "loading" } as const;

const FAILED = { status: "failed" } as const;

function readyFrom<Page extends PagedPage>(page: Readonly<Page>): PagedReady<Page> {
  return { ...page, status: "ready", more: "idle", rereading: false };
}

type Read<Page> = (cursor: string | null, signal: AbortSignal) => Promise<Page>;

export interface PagedReads<Page, Added> {
  readonly first: (signal: AbortSignal) => Promise<Page>;
  readonly after: (cursor: string, signal: AbortSignal) => Promise<Added>;
}

type Joined<Page, Added> = (shown: Readonly<Page>, added: Readonly<Added>) => Page;

type Write<Page extends PagedPage> = (change: (now: Paged<Page>) => Paged<Page>) => void;

function usePaged<Page extends PagedPage>() {
  const [state, setState] = useState<Paged<Page>>(LOADING);
  const latest = useRef<Paged<Page>>(LOADING);

  const write = useCallback((change: (now: Paged<Page>) => Paged<Page>) => {
    latest.current = change(latest.current);
    setState(latest.current);
  }, []);

  return { state, latest, write };
}

export function samePages<Page>(read: Read<Page>): PagedReads<Page, Page> {
  return { first: (signal) => read(null, signal), after: read };
}

async function attempt<Page>(read: () => Promise<Page>): Promise<Page | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

function appended<Page extends PagedPage, Added>(
  now: Paged<Page>,
  page: Readonly<Added> | null,
  joined: Joined<Page, Added>,
): Paged<Page> {
  if (now.status !== "ready") return now;

  return page === null ? { ...now, more: "failed" } : readyFrom(joined(now, page));
}

interface NextRead<Page extends PagedPage, Added> {
  readonly after: PagedReads<Page, Added>["after"];
  readonly cursor: string;
  readonly signal: AbortSignal;
  readonly joined: Joined<Page, Added>;
  readonly write: Write<Page>;
}

function appendNext<Page extends PagedPage, Added>({
  after,
  cursor,
  signal,
  joined,
  write,
}: NextRead<Page, Added>): void {
  void attempt(() => after(cursor, signal)).then((page) => {
    if (!signal.aborted) write((now) => appended(now, page, joined));

    return page;
  });
}

async function reloaded<Page extends PagedPage, Added extends PagedPage>(
  reads: PagedReads<Page, Added>,
  joined: Joined<Page, Added>,
  { covers, signal }: Readonly<{ covers: (shown: Readonly<Page>) => boolean; signal: AbortSignal }>,
): Promise<Page | null> {
  const first = await attempt(() => reads.first(signal));

  return first === null
    ? null
    : readThrough(first, {
        read: (cursor) => attempt(() => reads.after(cursor, signal)),
        joined,
        covers,
      });
}

async function firstRead<Page extends PagedPage>(
  read: PagedReads<Page, unknown>["first"],
  ticket: Ticket,
  write: Write<Page>,
): Promise<void> {
  const signal = ticket.take();
  const page = await attempt(() => read(signal));

  if (!signal.aborted) write(() => (page === null ? FAILED : readyFrom(page)));
}

function useFirstRead<Page extends PagedPage>(
  read: PagedReads<Page, unknown>["first"],
  ticket: Ticket,
  write: Write<Page>,
) {
  useEffect(() => {
    void firstRead(read, ticket, write);
  }, [read, write, ticket]);

  return useCallback(async () => {
    write((now) => (now.status === "ready" ? { ...now, rereading: true } : LOADING));
    await firstRead(read, ticket, write);
  }, [read, write, ticket]);
}

export function usePagedRead<Page extends PagedPage, Added extends PagedPage>(
  reads: PagedReads<Page, Added>,
  joined: Joined<Page, Added>,
) {
  const { state, latest, write } = usePaged<Page>();
  const ticket = useTicket();

  const retry = useFirstRead(reads.first, ticket, write);

  const refresh = useCallback(
    async (covers: (shown: Readonly<Page>, loaded: Readonly<Page>) => boolean) => {
      const loaded = latest.current;

      if (loaded.status !== "ready" || loaded.more === "loading" || loaded.rereading) return;

      const signal = ticket.current();
      const page = await reloaded(reads, joined, {
        covers: (shown) => covers(shown, loaded),
        signal,
      });

      if (page === null || signal.aborted) return;

      write((now) => (now.status === "ready" ? { ...readyFrom(page), more: now.more } : now));
    },
    [joined, latest, reads, ticket, write],
  );

  const loadMore = useCallback((): boolean => {
    const current = latest.current;

    if (
      current.status !== "ready" ||
      current.next === null ||
      current.more === "loading" ||
      current.rereading
    ) {
      return false;
    }

    const signal = ticket.take();
    write(() => ({ ...current, more: "loading" }));
    appendNext({ after: reads.after, cursor: current.next, signal, joined, write });

    return true;
  }, [joined, latest, reads, ticket, write]);

  return { state, retry, refresh, loadMore };
}
