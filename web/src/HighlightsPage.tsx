import { useCallback, useRef, useState } from "react";

import { useFilters } from "./filters.ts";
import { HighlightsBar } from "./HighlightsBar.tsx";
import { HighlightsBody } from "./HighlightsBody.tsx";
import { HighlightsTools } from "./HighlightsTools.tsx";
import type { Route } from "./routing.ts";
import { useHighlightsPage } from "./use-highlights-page.ts";
import type { Look } from "./use-root.ts";

function focusFirstEntry(): void {
  document.querySelector<HTMLElement>(".hp-open")?.focus();
}

export function HighlightsPage({
  look,
  route,
  back,
}: Readonly<{ look: Look; route: Route; back: () => void }>) {
  const field = useRef<HTMLInputElement>(null);
  const [now] = useState(Date.now);
  const filtering = useFilters();
  const { filters, clear } = filtering;
  const { state, retry, loadMore } = useHighlightsPage(filters);

  const clearAll = useCallback(() => {
    clear();
    field.current?.focus();
  }, [clear]);

  return (
    <div className="pg hp">
      <HighlightsBar back={back} />
      <main className="pg-col hp-col" aria-busy={state.status === "loading"}>
        <HighlightsTools
          state={state}
          filters={filters}
          look={look}
          field={field}
          filtering={filtering}
          leave={focusFirstEntry}
        />
        <HighlightsBody
          state={state}
          filters={filters}
          now={now}
          navigate={route.navigate}
          retry={retry}
          loadMore={loadMore}
          clearAll={clearAll}
        />
      </main>
    </div>
  );
}
