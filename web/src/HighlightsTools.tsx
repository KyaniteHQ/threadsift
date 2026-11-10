import type { RefObject } from "react";

import type { Filters, useFilters } from "./filters.ts";
import { FilterGhost, FilterPane } from "./Filters.tsx";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { SearchField } from "./SearchField.tsx";
import type { PageState } from "./use-highlights-page.ts";
import type { Look } from "./use-root.ts";

export function HighlightsTools({
  state,
  filters,
  look,
  field,
  filtering,
  leave,
}: Readonly<{
  state: PageState;
  filters: Filters;
  look: Look;
  field: RefObject<HTMLInputElement | null>;
  filtering: Readonly<ReturnType<typeof useFilters>>;
  leave: () => void;
}>) {
  if (state.status === "failed" || (state.status === "ready" && state.counts.total === 0)) {
    return null;
  }

  return (
    <>
      <SearchField
        value={filters.q}
        label={HIGHLIGHTS_PAGE.searchLabel}
        placeholder={HIGHLIGHTS_PAGE.searchPlaceholder}
        field={field}
        search={filtering.search}
        hint={null}
        leave={leave}
        ghost={state.status === "loading"}
      />
      <div className="filters-slot">
        {state.status === "ready" ? (
          <FilterPane
            counts={state.counts}
            filters={filters}
            collapsible={look.narrow}
            bar
            choose={filtering.choose}
            clearChosen={filtering.clearChosen}
          />
        ) : (
          <FilterGhost collapsible={look.narrow} bar />
        )}
      </div>
    </>
  );
}
