import { useCallback, useEffect, useRef, useState } from "react";

import type { HighlightsPage } from "../../src/http/highlights-page-schemas.ts";
import { fetchHighlightsPage } from "./api.ts";
import type { Filters } from "./filters.ts";
import { useLatest } from "./use-latest.ts";

type More = "idle" | "loading" | "failed";

export interface Ready {
  readonly status: "ready";
  readonly query: Filters;
  readonly entries: HighlightsPage["entries"];
  readonly next: string | null;
  readonly counts: HighlightsPage["counts"];
  readonly more: More;
}

export type PageState = { readonly status: "loading" } | { readonly status: "failed" } | Ready;

const LOADING: PageState = { status: "loading" };
const FAILED: PageState = { status: "failed" };

function readyFrom(query: Filters, page: Readonly<HighlightsPage>): Ready {
  return { status: "ready", query, ...page, more: "idle" };
}

async function attempt(
  filters: Readonly<Filters>,
  cursor: string | null,
): Promise<HighlightsPage | null> {
  try {
    return await fetchHighlightsPage(filters, cursor);
  } catch {
    return null;
  }
}

function appended(now: PageState, page: Readonly<HighlightsPage> | null): PageState {
  if (now.status !== "ready") return now;

  return page === null
    ? { ...now, more: "failed" }
    : { ...readyFrom(now.query, page), entries: [...now.entries, ...page.entries] };
}

export function canLoadMore(state: Readonly<Ready>, query: Readonly<Filters>): boolean {
  return state.query === query && state.next !== null && state.more !== "loading";
}

export function useHighlightsPage(filters: Readonly<Filters>) {
  const [state, setState] = useState<PageState>(LOADING);
  const ticket = useRef(0);
  const latest = useLatest(state);

  const first = useCallback(async () => {
    ticket.current += 1;
    const mine = ticket.current;
    const page = await attempt(filters, null);

    if (ticket.current === mine) setState(page === null ? FAILED : readyFrom(filters, page));
  }, [filters]);

  useEffect(() => {
    void first();
  }, [first]);

  const retry = useCallback(() => {
    setState(LOADING);
    void first();
  }, [first]);

  const loadMore = useCallback((): boolean => {
    const current = latest.current;

    if (current.status !== "ready" || !canLoadMore(current, filters)) return false;

    const mine = ticket.current;
    setState({ ...current, more: "loading" });

    void attempt(filters, current.next).then((page) => {
      if (ticket.current === mine) setState((now) => appended(now, page));

      return page;
    });

    return true;
  }, [filters, latest]);

  return { state, retry, loadMore };
}
