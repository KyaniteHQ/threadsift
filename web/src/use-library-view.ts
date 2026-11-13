import { type RefObject, useCallback, useRef } from "react";

import type { FilterCounts } from "../../src/core/filter-counts-contract.ts";
import type { Item } from "../../src/http/schemas.ts";
import { useLibrary } from "./library.ts";
import { type ListState, countsOf, knownItems } from "./list-state.ts";
import type { Route } from "./routing.ts";
import { useListActions } from "./use-list-actions.ts";
import { type ReaderSide, useReaderSide } from "./use-reader-side.ts";
import type { Look } from "./use-root.ts";
import { useShownList } from "./use-shown-list.ts";

export interface LibraryView {
  readonly root: RefObject<HTMLDivElement | null>;
  readonly listPane: RefObject<HTMLElement | null>;
  readonly searchField: RefObject<HTMLInputElement | null>;
  readonly library: Readonly<ReturnType<typeof useLibrary>>;
  readonly shown: ListState;
  readonly reserves: boolean;
  readonly expectsEmpty: boolean;
  readonly actions: Readonly<ReturnType<typeof useListActions>>;
  readonly side: ReaderSide;
  readonly clearAll: () => void;
  readonly openItem: Item | null;
  readonly covered: boolean;
  readonly counts: FilterCounts | null;
}

export function useLibraryView(look: Look, route: Route): LibraryView {
  const listPane = useRef<HTMLElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const library = useLibrary();
  const { list, clear } = library;
  const actions = useListActions(list, library, listPane, route);
  const openItem = knownItems(list).find((item) => item.id === route.openId) ?? null;
  const covered = look.reader !== "pane" && openItem !== null;
  const attend = actions.attend;
  const { shown, focusSearch, expectsEmpty } = useShownList({ root, searchField, list, look });

  const side = useReaderSide({
    list,
    look,
    route,
    writes: library,
    attend,
    root,
    focusSearch,
    covered,
  });

  const clearAll = useCallback(() => {
    clear();
    searchField.current?.focus();
  }, [clear]);

  const counts = countsOf(shown);

  return {
    root,
    listPane,
    searchField,
    library,
    shown,
    reserves: shown.status === "loading" && !expectsEmpty,
    expectsEmpty,
    actions,
    side,
    clearAll,
    openItem,
    covered,
    counts,
  };
}
