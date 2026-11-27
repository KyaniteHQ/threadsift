import { type RefObject, useCallback, useEffect, useRef } from "react";

import { type FocusWatch, watchFocus } from "./focus-watch.ts";
import type { More } from "./list-paging.ts";

export interface LoadedRows {
  readonly count: number;
  readonly more: More;
}

interface Waiting {
  readonly from: number;
  readonly focus: FocusWatch;
}

export function useFocusNewRows(
  list: RefObject<HTMLElement | null>,
  { count, more }: Readonly<LoadedRows>,
  { link, row = ":scope > *" }: Readonly<{ link: string; row?: string | undefined }>,
): (from: number | null) => void {
  const waiting = useRef<Waiting | null>(null);

  useEffect(() => {
    const wait = waiting.current;

    if (wait === null) return;

    if (count <= wait.from) {
      if (more !== "loading") {
        wait.focus.stop();
        waiting.current = null;
      }

      return;
    }

    waiting.current = null;
    wait.focus.stop();

    if (wait.focus.unmoved()) {
      list.current?.querySelectorAll(row)[wait.from]?.querySelector<HTMLElement>(link)?.focus();
    }
  }, [count, link, list, more, row]);

  useEffect(() => () => waiting.current?.focus.stop(), []);

  return useCallback((from) => {
    waiting.current?.focus.stop();
    waiting.current = from === null ? null : { from, focus: watchFocus() };
  }, []);
}
