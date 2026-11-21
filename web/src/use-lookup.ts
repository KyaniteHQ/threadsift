import { useCallback, useEffect, useState } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { lookUp } from "./item-reads.ts";
import type { ListState } from "./list-state.ts";
import { LIBRARY_PATH, type Route } from "./routing.ts";

export function useLookup(
  list: ListState,
  { openId, replace }: Route,
  know: (item: Readonly<Item>) => void,
) {
  const [failedFor, setFailedFor] = useState<number | null>(null);

  const missing =
    list.status === "ready" && openId !== null && !list.known.some((item) => item.id === openId);

  const lookingUp = missing && openId !== failedFor;

  useEffect(() => {
    let current = true;

    const find = async (): Promise<void> => {
      if (!lookingUp || openId === null) return;

      const found = await lookUp(openId);

      if (!current) return;

      if (found === "gone") replace(LIBRARY_PATH);
      else if (found === "failed") setFailedFor(openId);
      else know(found);
    };

    void find();

    return () => {
      current = false;
    };
  }, [know, lookingUp, openId, replace]);

  if (failedFor !== null && openId !== failedFor) setFailedFor(null);

  const lookupFailed = missing && openId === failedFor;

  const lookAgain = useCallback(() => {
    setFailedFor(null);
  }, []);

  return { lookupFailed, lookAgain };
}
