import type { FilterCounts } from "../../src/core/filter-counts-contract.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { SaveTarget } from "./api.ts";
import { Brand } from "./Brand.tsx";
import type { Choice, Filters } from "./filters.ts";
import { FilterGhost, FilterPane } from "./Filters.tsx";
import { PasteBox } from "./PasteBox.tsx";
import type { Pages } from "./routing.ts";
import type { PasteQueue, SaveOutcome } from "./use-paste.ts";
import type { Look } from "./use-root.ts";

function FilterSlot({
  counts,
  loading,
  filters,
  look,
  choose,
  clearChosen,
  hasRows,
}: Readonly<{
  counts: FilterCounts | null;
  loading: boolean;
  filters: Filters;
  look: Look;
  choose: (choice: Choice) => void;
  clearChosen: () => void;
  hasRows: boolean;
}>) {
  const bar = look.settings.layout === "grid";
  const collapsible = bar ? look.narrow : look.medium;

  if (loading)
    return collapsible || bar ? (
      <div className="filters-slot">
        <FilterGhost collapsible={collapsible} bar={bar} />
      </div>
    ) : null;

  if (counts === null || counts.total === 0) return null;

  return (
    <div className="filters-slot">
      <FilterPane
        counts={counts}
        filters={filters}
        collapsible={collapsible}
        bar={bar}
        choose={choose}
        clearChosen={clearChosen}
        hasRows={hasRows}
      />
    </div>
  );
}

export function Masthead({
  look,
  pages,
  counts,
  loading,
  filters,
  choose,
  clearChosen,
  hasRows,
  save,
  focusOnMount,
  items,
  queue,
  open,
}: Readonly<{
  look: Look;
  pages: Pages;
  counts: FilterCounts | null;
  loading: boolean;
  filters: Filters;
  choose: (choice: Choice) => void;
  clearChosen: () => void;
  hasRows: boolean;
  save: (target: SaveTarget) => Promise<SaveOutcome>;
  focusOnMount: boolean;
  items: readonly Item[];
  queue: PasteQueue;
  open: (id: number) => void;
}>) {
  const total = counts !== null && counts.total > 0 ? counts.total : null;

  return (
    <header className="mast">
      <Brand look={look} pages={pages} total={total} />
      <PasteBox save={save} focusOnMount={focusOnMount} items={items} queue={queue} open={open} />
      <FilterSlot
        counts={counts}
        loading={loading}
        filters={filters}
        look={look}
        choose={choose}
        clearChosen={clearChosen}
        hasRows={hasRows}
      />
    </header>
  );
}
