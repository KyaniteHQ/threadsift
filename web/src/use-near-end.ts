import { type RefObject, useEffect, useEffectEvent } from "react";

import type { Item } from "../../src/http/schemas.ts";

const ROWS_BEFORE_END = 10;

export function useNearEnd(
  list: RefObject<HTMLElement | null>,
  items: readonly Item[],
  active: boolean,
  reached: () => void,
): void {
  const onReached = useEffectEvent(reached);

  useEffect(() => {
    const rows = list.current?.children;
    const last = items.length - 1;

    const watched = [Math.max(0, last - ROWS_BEFORE_END + 1), last].flatMap((at) => {
      const row = rows?.[at];

      return row === undefined ? [] : [row];
    });

    const watcher = new IntersectionObserver((seen) => {
      if (seen.some((each) => each.isIntersecting)) onReached();
    });

    if (active) {
      for (const row of watched) watcher.observe(row);
    }

    return () => {
      watcher.disconnect();
    };
  }, [active, items, list]);
}
