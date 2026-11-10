import type { RefObject } from "react";

import type { Filters } from "./filters.ts";
import { type ListState, countsOf } from "./list-state.ts";
import { ListHead, ListHeadGhost } from "./ListBody.tsx";
import { SearchField } from "./SearchField.tsx";
import { SEARCH_LABEL, SEARCH_PLACEHOLDER } from "./text.ts";

export function ListTools({
  list,
  reserves,
  filters,
  field,
  search,
  hint,
  leave,
}: Readonly<{
  list: ListState;
  reserves: boolean;
  filters: Filters;
  field: RefObject<HTMLInputElement | null>;
  search: (text: string) => void;
  hint: string | null;
  leave: () => void;
}>) {
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
      {list.status === "ready" && counts !== null ? (
        <ListHead counts={counts} shown={list.items.length} filters={filters} />
      ) : null}
    </>
  );
}
