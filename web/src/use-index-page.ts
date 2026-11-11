import { useCallback, useEffect, useRef, useState } from "react";

import type { TopicIndex } from "../../src/core/topic-index-contract.ts";
import { fetchTopicIndex } from "./index-api.ts";
import type { More } from "./LoadMore.tsx";
import { useLatest } from "./use-latest.ts";

export interface IndexReady {
  readonly status: "ready";
  readonly topics: TopicIndex["topics"];
  readonly total: number;
  readonly next: string | null;
  readonly more: More;
}

export type IndexState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | IndexReady;

const LOADING: IndexState = { status: "loading" };

const FAILED: IndexState = { status: "failed" };

function readyFrom(page: Readonly<TopicIndex>): IndexReady {
  return { status: "ready", ...page, more: "idle" };
}

async function attempt(cursor: string | null): Promise<TopicIndex | null> {
  try {
    return await fetchTopicIndex(cursor);
  } catch {
    return null;
  }
}

function appended(now: IndexState, page: Readonly<TopicIndex> | null): IndexState {
  if (now.status !== "ready") return now;

  return page === null
    ? { ...now, more: "failed" }
    : { ...readyFrom(page), topics: [...now.topics, ...page.topics] };
}

export function useIndexPage() {
  const [state, setState] = useState<IndexState>(LOADING);
  const ticket = useRef(0);
  const latest = useLatest(state);

  const first = useCallback(async () => {
    ticket.current += 1;
    const mine = ticket.current;
    const page = await attempt(null);

    if (ticket.current === mine) setState(page === null ? FAILED : readyFrom(page));
  }, []);

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

    void attempt(current.next).then((page) => {
      if (ticket.current === mine) setState((now) => appended(now, page));

      return page;
    });
  }, [latest]);

  return { state, retry, loadMore };
}
