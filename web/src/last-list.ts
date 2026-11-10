import { useEffect, useState } from "react";

import type { ListState } from "./list-state.ts";

const LAST_LIST_KEY = "threadsift.last-list";

function lastListWasEmpty(): boolean {
  try {
    return localStorage.getItem(LAST_LIST_KEY) === "empty";
  } catch {
    return false;
  }
}

function rememberLastList(empty: boolean): void {
  try {
    localStorage.setItem(LAST_LIST_KEY, empty ? "empty" : "populated");
  } catch {}
}

export function useLastListEmpty(list: Readonly<ListState>): boolean {
  const [wasEmpty] = useState(lastListWasEmpty);
  const total = list.status === "ready" ? list.counts.total : null;

  useEffect(() => {
    if (total !== null) rememberLastList(total === 0);
  }, [total]);

  return wasEmpty;
}
