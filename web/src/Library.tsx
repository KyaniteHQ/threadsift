import { type RefObject, useCallback, useRef } from "react";

import type { Filters } from "./filters.ts";
import { type ListState, countsOf, knownItems, useLibrary } from "./library.ts";
import { ListBody, ListHead } from "./ListBody.tsx";
import { Masthead } from "./Masthead.tsx";
import type { Route } from "./routing.ts";
import { SearchField } from "./SearchField.tsx";
import { useListActions } from "./use-list-actions.ts";
import type { Look } from "./use-root.ts";

function ListTools({
  list,
  filters,
  field,
  search,
}: Readonly<{
  list: ListState;
  filters: Filters;
  field: RefObject<HTMLInputElement | null>;
  search: (text: string) => void;
}>) {
  const counts = countsOf(list);

  if (counts === null || counts.total === 0) return null;

  return (
    <>
      <SearchField value={filters.q} field={field} search={search} />
      {list.status === "ready" ? (
        <ListHead counts={counts} shown={list.items.length} filters={filters} />
      ) : null}
    </>
  );
}

export function Library({
  look,
  arrived,
  route,
  openSettings,
}: Readonly<{ look: Look; arrived: boolean; route: Route; openSettings: () => void }>) {
  const listPane = useRef<HTMLElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const { list, filters, save, retry, choose, search, clear, clearChosen } = useLibrary();
  const actions = useListActions(list, { save, retry }, listPane, route);
  const counts = countsOf(list);

  const clearAll = useCallback(() => {
    clear();
    searchField.current?.focus();
  }, [clear]);

  return (
    <div className={counts?.total === 0 ? "lib is-empty" : "lib"}>
      <div className="bg">
        <Masthead
          look={look}
          openSettings={openSettings}
          counts={counts}
          filters={filters}
          choose={choose}
          clearChosen={clearChosen}
          save={actions.saveAndShow}
          focusOnMount={arrived}
          items={knownItems(list)}
          request={actions.request}
        />
        <ListTools list={list} filters={filters} field={searchField} search={search} />
        <main ref={listPane} className="list" tabIndex={-1}>
          <ListBody
            list={list}
            openId={route.openId}
            attention={actions.attention}
            attended={actions.attended}
            retry={actions.retryAndKeepPlace}
            tryAgain={actions.tryAgain}
            clearAll={clearAll}
          />
        </main>
      </div>
    </div>
  );
}
