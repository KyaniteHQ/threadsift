import { type RefObject, useEffect, useEffectEvent } from "react";

const ROWS_BEFORE_END = 10;

export function useNearEnd(
  list: RefObject<HTMLElement | null>,
  rows: number,
  active: boolean,
  reached: () => void,
): void {
  const onReached = useEffectEvent(reached);

  useEffect(() => {
    const row = list.current?.children[Math.max(0, rows - ROWS_BEFORE_END)];

    const watcher = new IntersectionObserver((seen) => {
      if (seen.some((each) => each.isIntersecting)) onReached();
    });

    if (active && row !== undefined) watcher.observe(row);

    return () => {
      watcher.disconnect();
    };
  }, [active, list, rows]);
}
