import { useEffect, useRef } from "react";

import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";

function focusIsInDialog(): boolean {
  const focused = document.activeElement;

  return focused instanceof Element && focused.closest("dialog") !== null;
}

export function useCardReturn({
  list,
  openId,
  covers,
  attend,
  appOf,
}: Readonly<{
  list: ListState;
  openId: number | null;
  covers: boolean;
  attend: (attention: Attention) => void;
  appOf: () => Element | null;
}>): void {
  const lastOpen = useRef(openId);

  useEffect(() => {
    const left = lastOpen.current;
    lastOpen.current = openId;

    const returned = left !== null && openId === null && covers;

    if (!returned || focusIsInDialog()) return;

    if (list.status === "ready" && list.items.some((item) => item.id === left)) {
      attend({ id: left, focus: true });
    } else {
      appOf()?.querySelector<HTMLElement>(".list")?.focus();
    }
  }, [appOf, attend, covers, list, openId]);
}
