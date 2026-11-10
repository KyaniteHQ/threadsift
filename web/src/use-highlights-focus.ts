import { type RefObject, useCallback, useEffect, useRef } from "react";

import { focusNeighbour } from "./reveal.ts";
import { useLibraryKeys } from "./use-library-keys.ts";

const NOTHING = (): void => undefined;

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
  count: number,
): (from: number) => void {
  const waiting = useRef<number | null>(null);

  useEffect(() => {
    if (waiting.current !== null && count > waiting.current) {
      list.current?.querySelectorAll<HTMLElement>(".hp-open")[waiting.current]?.focus();
      waiting.current = null;
    }
  }, [count, list]);

  return useCallback((from: number) => {
    waiting.current = from;
  }, []);
}
