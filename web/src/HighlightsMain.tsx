import { useCallback, useRef, useState } from "react";

import { useFilters } from "./filters.ts";
import { highlightsHeadText } from "./head-label.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { HighlightsBody } from "./HighlightsBody.tsx";
import { HighlightsTools } from "./HighlightsTools.tsx";
import { RetryNotice } from "./ListBody.tsx";
import { SettledAnnouncement } from "./SettledAnnouncement.tsx";
import { useEntryKeys } from "./use-highlights-focus.ts";
import { useHighlightsPage } from "./use-highlights-page.ts";
import type { Look } from "./use-root.ts";

function focusFirstEntry(): void {
  document.querySelector<HTMLElement>(".hp-open")?.focus();
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

  const head = state.status === "ready" ? highlightsHeadText(state.counts, filters) : "";

  return (
    <main className="pg-col hp-col" aria-busy={state.status === "loading"}>
      <HighlightsTools
        state={state}
        look={look}
        field={field}
        filtering={filtering}
        leave={focusFirstEntry}
      />
      <RetryNotice
        failed={state.status === "failed"}
        text={HIGHLIGHTS_PAGE.loadFailed}
        action={retryLoad}
      />
      <HighlightsBody
        state={state}
        head={head}
        filters={filters}
        now={now}
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
