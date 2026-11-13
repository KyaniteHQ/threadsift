import { type RefObject, useCallback, useEffect, useRef } from "react";

interface Waiting {
  readonly from: number;
  readonly origin: Element | null;
}

export function useFocusNewRows(
  list: RefObject<HTMLElement | null>,
  count: number,
  link: string,
): (from: number | null) => void {
  const waiting = useRef<Waiting | null>(null);

  useEffect(() => {
    const wait = waiting.current;

    if (wait === null || count <= wait.from) return;

    waiting.current = null;

    const active = document.activeElement;

    if (active === wait.origin || active === document.body) {
      list.current?.children[wait.from]?.querySelector<HTMLElement>(link)?.focus();
    }
  }, [count, link, list]);

  return useCallback((from) => {
    waiting.current = from === null ? null : { from, origin: document.activeElement };
  }, []);
}
