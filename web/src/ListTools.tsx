import type { RefObject } from "react";

import type { SettingKey, Settings } from "../../design/system/settings-table.ts";
import { type Filters, isFiltered, isSearching } from "./filters.ts";
import { ITEM_HEAD, headLabel } from "./head-label.ts";
import { LayoutToggle } from "./LayoutToggle.tsx";
import { matchedCount } from "./list-counts.ts";
import { type ListState, type Ready, countsOf, readFor } from "./list-state.ts";
import { ListHead } from "./ListBody.tsx";
import { SearchField } from "./SearchField.tsx";
import { SettledAnnouncement } from "./SettledAnnouncement.tsx";
import { SEARCH_LABEL, SEARCH_PLACEHOLDER, SORT_LABEL } from "./text.ts";

interface ListToolsProps {
  readonly list: ListState;
  readonly filters: Filters;
  readonly field: RefObject<HTMLInputElement | null>;
  readonly search: (text: string) => void;
  readonly hint: string | null;
  readonly leave: () => void;
  readonly query: string;
  readonly active: boolean;
  readonly layout: Settings["layout"];
  readonly pick: (key: SettingKey, id: string) => void;
}

function headText(list: Readonly<Ready>, filters: Readonly<Filters>): string {
  if (list.counts.total === 0) return "";

  const shown = list.next === null ? list.items.length : matchedCount(list.counts, filters);
  const text = isSearching(filters) ? filters.q.trim() : "";

  return headLabel(ITEM_HEAD, { ...list.counts, shown: isFiltered(filters) ? shown : null }, text);
}

function Tools({
  list,
  filters,
  field,
  search,
  hint,
  leave,
  layout,
  pick,
  head,
}: Readonly<Omit<ListToolsProps, "query" | "active"> & { head: string }>) {
  const counts = countsOf(list);

  if (list.status !== "loading" && (counts === null || counts.total === 0)) return null;

  return (
    <>
      <SearchField
        value={filters.q}
        label={SEARCH_LABEL}
        placeholder={SEARCH_PLACEHOLDER}
        field={field}
        search={search}
        hint={hint}
        leave={leave}
      >
        <LayoutToggle layout={layout} pick={pick} />
      </SearchField>
      {list.status === "loading" ? (
        <div className="list-head" data-loading aria-hidden="true" />
      ) : (
        <ListHead label={head} sort={SORT_LABEL} />
      )}
    </>
  );
}

export function ListTools({ query, active, ...tools }: Readonly<ListToolsProps>) {
  const { list, filters } = tools;
  const head = list.status === "ready" ? headText(list, filters) : "";

  return (
    <>
      <Tools {...tools} head={head} />
      <SettledAnnouncement text={readFor(list, query) ? head : null} active={active} />
    </>
  );
}
