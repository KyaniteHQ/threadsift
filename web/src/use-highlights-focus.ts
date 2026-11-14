import type { RefObject } from "react";

import type { More } from "./list-paging.ts";
import { NOTHING } from "./nothing.ts";
import { focusNeighbour } from "./reveal.ts";
import { useFocusNewRows } from "./use-focus-new-rows.ts";
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
  rows: Readonly<{ count: number; more: More }>,
): (from: number) => void {
  return useFocusNewRows(list, rows, ENTRIES.links);
}
