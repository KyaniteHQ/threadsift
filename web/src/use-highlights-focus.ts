import type { RefObject } from "react";

import { NOTHING } from "../../src/core/contract/nothing.ts";
import { focusNeighbour } from "./reveal.ts";
import { CHILD_ROWS, type LoadedRows, useFocusNewRows } from "./use-focus-new-rows.ts";
import { useLibraryKeys } from "./use-library-keys.ts";

const ENTRIES = { links: ".hp-open", row: "article.hp-it", link: ".hp-open" } as const;

function focusSearch(): void {
  document.querySelector<HTMLInputElement>(".search input")?.focus();
}

export function useEntryKeys(list: RefObject<HTMLOListElement | null>): void {
  useLibraryKeys({
    openId: null,
    covered: false,
    arrows: false,
    step: (direction) => {
      focusNeighbour(list.current, direction, ENTRIES);
    },
    toggle: NOTHING,
    close: NOTHING,
    focusSearch,
  });
}

export function useFocusNewEntries(
  list: RefObject<HTMLOListElement | null>,
  rows: Readonly<LoadedRows>,
): (from: number | null) => void {
  return useFocusNewRows(list, rows, { link: ENTRIES.links, row: CHILD_ROWS });
}
