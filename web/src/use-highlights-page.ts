import { useCallback, useMemo } from "react";

import type {
  HighlightsList,
  HighlightsPage,
} from "../../src/core/contract/highlights-page-wire.ts";
import { fetchHighlights, fetchHighlightsAfter } from "./api.ts";
import type { Filters } from "./filters.ts";
import { type Paged, type PagedReady, type PagedReads, usePagedRead } from "./use-paged-read.ts";

type FilteredPage = HighlightsList & { readonly query: Filters };

export type Ready = PagedReady<FilteredPage>;

export type PageState = Paged<FilteredPage>;

function withMoreEntries(
  shown: Readonly<FilteredPage>,
  added: Readonly<HighlightsPage>,
): FilteredPage {
  return { ...shown, entries: [...shown.entries, ...added.entries], next: added.next };
}

export function canLoadMore(state: Readonly<Ready>, query: Readonly<Filters>): boolean {
  return state.query === query && state.next !== null && state.more !== "loading";
}

export function useHighlightsPage(filters: Readonly<Filters>) {
  const reads = useMemo(
    (): PagedReads<FilteredPage, HighlightsPage> => ({
      first: async (signal) => ({ ...(await fetchHighlights(filters, signal)), query: filters }),
      after: (cursor, signal) => fetchHighlightsAfter(filters, cursor, signal),
    }),
    [filters],
  );

  const { state, retry, loadMore: loadNext } = usePagedRead(reads, withMoreEntries);

  const loadMore = useCallback(
    (): boolean => state.status === "ready" && state.query === filters && loadNext(),
    [filters, loadNext, state],
  );

  return { state, retry, loadMore };
}
