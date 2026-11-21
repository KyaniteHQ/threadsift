import { useCallback, useRef, useState } from "react";

import { type Filters, isFiltered, isSearching, useFilters } from "./filters.ts";
import { HIGHLIGHTS_HEAD, headLabel } from "./head-label.ts";
import { HighlightsBody } from "./HighlightsBody.tsx";
import { HighlightsTools } from "./HighlightsTools.tsx";
import { matchedCount } from "./list-counts.ts";
import { SettledAnnouncement } from "./SettledAnnouncement.tsx";
import { useEntryKeys } from "./use-highlights-focus.ts";
import { type Ready, useHighlightsPage } from "./use-highlights-page.ts";
import type { Look } from "./use-root.ts";

function focusFirstEntry(): void {
  document.querySelector<HTMLElement>(".hp-open")?.focus();
}

function highlightsHeadText(state: Readonly<Ready>, filters: Readonly<Filters>): string {
  if (state.counts.total === 0) return "";
  const shown = isFiltered(filters) ? matchedCount(state.counts, filters) : null;
  const text = isSearching(filters) ? filters.q.trim() : "";

  return headLabel(HIGHLIGHTS_HEAD, { total: state.counts.total, shown }, text);
}

export function HighlightsMain({ look }: Readonly<{ look: Look }>) {
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [now] = useState(Date.now);
  const filtering = useFilters();
  const { filters, clear } = filtering;
  const { state, retry, loadMore } = useHighlightsPage(filters);
  useEntryKeys(list);

  const retryLoad = useCallback(() => {
    void retry();
  }, [retry]);

  const clearAll = useCallback(() => {
    clear();
    field.current?.focus();
  }, [clear]);

  const head = state.status === "ready" ? highlightsHeadText(state, filters) : "";

  return (
    <main className="pg-col hp-col" aria-busy={state.status === "loading"}>
      <HighlightsTools
        state={state}
        look={look}
        field={field}
        filtering={filtering}
        leave={focusFirstEntry}
      />
      <HighlightsBody
        state={state}
        head={head}
        filters={filters}
        now={now}
        retry={retryLoad}
        loadMore={loadMore}
        clearAll={clearAll}
        list={list}
      />
      <SettledAnnouncement
        text={state.status === "ready" && state.query === filters ? head : null}
      />
    </main>
  );
}
