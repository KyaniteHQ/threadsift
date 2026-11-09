import type { FilterCounts } from "../../src/core/item-filters.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { SaveTarget } from "./api.ts";
import type { Choice, Filters } from "./filters.ts";
import { FilterGhost, FilterPane } from "./Filters.tsx";
import { PasteBox } from "./PasteBox.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { totalName } from "./text.ts";
import type { PasteRequest, SaveOutcome } from "./use-paste.ts";
import type { Look } from "./use-root.ts";

function Total({ count }: Readonly<{ count: number }>) {
  return (
    <span className="brand-n">
      <span aria-hidden="true">{count}</span>
      <span className="vh">{totalName(count)}</span>
    </span>
  );
}

function Brand({
  look,
  openSettings,
  total,
}: Readonly<{ look: Look; openSettings: () => void; total: number | null }>) {
  return (
    <div className="brand">
      <h1>Threadsift</h1>
      {total === null ? null : <Total count={total} />}
      <SettingsPanel look={look} openInstanceSettings={openSettings} />
    </div>
  );
}

function FilterSlot({
  counts,
  loading,
  filters,
  look,
  choose,
  clearChosen,
}: Readonly<{
  counts: FilterCounts | null;
  loading: boolean;
  filters: Filters;
  look: Look;
  choose: (choice: Choice) => void;
  clearChosen: () => void;
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
      />
    </div>
  );
}

export function Masthead({
  look,
  openSettings,
  counts,
  loading,
  filters,
  choose,
  clearChosen,
  save,
  focusOnMount,
  items,
  request,
  open,
}: Readonly<{
  look: Look;
  openSettings: () => void;
  counts: FilterCounts | null;
  loading: boolean;
  filters: Filters;
  choose: (choice: Choice) => void;
  clearChosen: () => void;
  save: (target: SaveTarget) => Promise<SaveOutcome>;
  focusOnMount: boolean;
  items: readonly Item[];
  request: PasteRequest | null;
  open: (id: number) => void;
}>) {
  const total = counts !== null && counts.total > 0 ? counts.total : null;

  return (
    <header className="mast">
      <Brand look={look} openSettings={openSettings} total={total} />
      <PasteBox
        save={save}
        focusOnMount={focusOnMount}
        items={items}
        request={request}
        open={open}
      />
      <FilterSlot
        counts={counts}
        loading={loading}
        filters={filters}
        look={look}
        choose={choose}
        clearChosen={clearChosen}
      />
    </header>
  );
}
