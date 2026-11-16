import type { RefObject } from "react";

import { type Filters, isFiltered, isSearching } from "./filters.ts";
import { matchedCount } from "./list-counts.ts";
import { type ListState, type Ready, countsOf, readFor } from "./list-state.ts";
import { ListHead, ListHeadGhost } from "./ListBody.tsx";
import { SearchField } from "./SearchField.tsx";
import { SettledAnnouncement } from "./SettledAnnouncement.tsx";
import { SEARCH_LABEL, SEARCH_PLACEHOLDER, headLabel } from "./text.ts";

interface ListToolsProps {
  readonly list: ListState;
  readonly reserves: boolean;
  readonly filters: Filters;
  readonly field: RefObject<HTMLInputElement | null>;
  readonly search: (text: string) => void;
  readonly hint: string | null;
  readonly leave: () => void;
  readonly query: string;
  readonly active: boolean;
}

function headText(list: Readonly<Ready>, filters: Readonly<Filters>): string {
  if (list.counts.total === 0) return "";

  const shown = list.next === null ? list.items.length : matchedCount(list.counts, filters);
  const text = isSearching(filters) ? filters.q.trim() : "";

  return headLabel(list.counts, isFiltered(filters) ? shown : null, text);
}

function Tools({
  list,
  reserves,
  filters,
  field,
  search,
  hint,
  leave,
  head,
}: Readonly<Omit<ListToolsProps, "query" | "active"> & { head: string }>) {
  const counts = countsOf(list);

  if (!reserves && (counts === null || counts.total === 0)) return null;

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
        ghost={reserves}
      />
      {reserves ? <ListHeadGhost /> : null}
      {list.status === "ready" ? <ListHead label={head} /> : null}
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
