import { useCallback } from "react";

import type { HighlightsPage } from "../../src/http/highlights-page-schemas.ts";
import { fetchHighlightsPage } from "./api.ts";
import type { Filters } from "./filters.ts";
import { type Paged, type PagedReady, usePagedRead } from "./use-paged-read.ts";

type FilteredPage = HighlightsPage & { readonly query: Filters };

export type Ready = PagedReady<FilteredPage>;

export type PageState = Paged<FilteredPage>;

function withMoreEntries(
  shown: Readonly<FilteredPage>,
  added: Readonly<FilteredPage>,
): FilteredPage {
  return { ...added, entries: [...shown.entries, ...added.entries] };
}

export function canLoadMore(state: Readonly<Ready>, query: Readonly<Filters>): boolean {
  return state.query === query && state.next !== null && state.more !== "loading";
}

export function useHighlightsPage(filters: Readonly<Filters>) {
  const read = useCallback(
    async (cursor: string | null): Promise<FilteredPage> => ({
      ...(await fetchHighlightsPage(filters, cursor)),
      query: filters,
    }),
    [filters],
  );

  const { state, retry, loadMore: loadNext } = usePagedRead(read, withMoreEntries);

  const loadMore = useCallback(
    (): boolean => state.status === "ready" && state.query === filters && loadNext(),
    [filters, loadNext, state],
  );

  return { state, retry, loadMore };
}
