import { type RefObject, useCallback, useEffect, useRef } from "react";

import { focusUnmoved } from "./focus-unmoved.ts";
import type { More } from "./list-paging.ts";

export interface LoadedRows {
  readonly count: number;
  readonly more: More;
}

interface Waiting {
  readonly from: number;
  readonly unmoved: () => boolean;
}

export function useFocusNewRows(
  list: RefObject<HTMLElement | null>,
  { count, more }: Readonly<LoadedRows>,
  link: string,
): (from: number | null) => void {
  const waiting = useRef<Waiting | null>(null);

  useEffect(() => {
    const wait = waiting.current;

    if (wait === null) return;

    if (count <= wait.from) {
      if (more !== "loading") waiting.current = null;

      return;
    }

    waiting.current = null;

    if (wait.unmoved()) {
      list.current?.children[wait.from]?.querySelector<HTMLElement>(link)?.focus();
    }
  }, [count, link, list, more]);

  return useCallback((from) => {
    waiting.current = from === null ? null : { from, unmoved: focusUnmoved() };
  }, []);
}
