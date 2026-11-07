import type { RefObject } from "react";

import type { Filters } from "./filters.ts";
import { type ListState, countsOf } from "./list-state.ts";
import { ListHead } from "./ListBody.tsx";
import { SearchField } from "./SearchField.tsx";

export function ListTools({
  list,
  filters,
  field,
  search,
  hint,
  leave,
}: Readonly<{
  list: ListState;
  filters: Filters;
  field: RefObject<HTMLInputElement | null>;
  search: (text: string) => void;
  hint: string | null;
  leave: () => void;
}>) {
  const counts = countsOf(list);

  if (counts === null || counts.total === 0) return null;

  return (
    <>
      <SearchField value={filters.q} field={field} search={search} hint={hint} leave={leave} />
      {list.status === "ready" ? (
        <ListHead counts={counts} shown={list.items.length} filters={filters} />
      ) : null}
    </>
  );
}
