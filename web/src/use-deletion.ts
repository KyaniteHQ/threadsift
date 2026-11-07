import { useCallback } from "react";

import type { Item } from "../../src/http/schemas.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import { DELETED } from "./reader-text.ts";
import type { Route } from "./routing.ts";

const PASTE_FIELD = ".paste-row input";

export function survivorOf(list: Readonly<ListState>, id: number): number | null {
  if (list.status !== "ready") return null;

  const ids = list.items.map((item) => item.id);
  const at = ids.indexOf(id);

  return (at < 0 ? ids[0] : (ids[at + 1] ?? ids[at - 1])) ?? null;
}

export function useDeletion({
  list,
  route,
  attend,
  announce,
  appOf,
  remove,
}: Readonly<{
  list: ListState;
  route: Route;
  attend: (attention: Attention) => void;
  announce: (text: string) => void;
  appOf: () => Element | null;
  remove: (id: number, whenGone: () => void) => Promise<void>;
}>): (item: Item) => Promise<void> {
  const { leave } = route;

  return useCallback(
    async (item: Item): Promise<void> => {
      const survivor = survivorOf(list, item.id);

      await remove(item.id, () => {
        leave();
        attend(survivor === null ? null : { id: survivor, focus: true });
        announce(DELETED);
      });

      if (survivor === null) appOf()?.querySelector<HTMLElement>(PASTE_FIELD)?.focus();
    },
    [announce, appOf, attend, leave, list, remove],
  );
}
