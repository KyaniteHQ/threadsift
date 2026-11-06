import type { FilterCounts } from "../../src/core/item-filters.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { SaveTarget } from "./api.ts";
import type { Choice, Filters } from "./filters.ts";
import { FilterPane } from "./Filters.tsx";
import { PasteBox, type PasteRequest, type SaveOutcome } from "./PasteBox.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { totalName } from "./text.ts";
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
      <SettingsPanel
        settings={look.settings}
        themeNote={look.themeNote}
        modal={look.narrow}
        choose={look.pick}
        reset={look.reset}
        openInstanceSettings={openSettings}
      />
    </div>
  );
}

export function Masthead({
  look,
  openSettings,
  counts,
  filters,
  choose,
  clearChosen,
  save,
  focusOnMount,
  items,
  request,
}: Readonly<{
  look: Look;
  openSettings: () => void;
  counts: FilterCounts | null;
  filters: Filters;
  choose: (choice: Choice) => void;
  clearChosen: () => void;
  save: (target: SaveTarget) => Promise<SaveOutcome>;
  focusOnMount: boolean;
  items: readonly Item[];
  request: PasteRequest | null;
}>) {
  const shown = counts !== null && counts.total > 0 ? counts : null;

  return (
    <header className="mast">
      <Brand look={look} openSettings={openSettings} total={shown?.total ?? null} />
      <PasteBox save={save} focusOnMount={focusOnMount} items={items} request={request} />
      {shown === null ? null : (
        <div className="filters-slot">
          <FilterPane
            counts={shown}
            filters={filters}
            collapsible={look.medium}
            choose={choose}
            clearChosen={clearChosen}
          />
        </div>
      )}
    </header>
  );
}
