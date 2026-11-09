import { useCallback } from "react";

import type { Item } from "../../src/http/schemas.ts";
import type { Attention } from "./ItemRow.tsx";
import type { Writes } from "./library.ts";
import { DELETED } from "./reader-text.ts";
import type { Route } from "./routing.ts";
import { useLatest } from "./use-latest.ts";

const PASTE_FIELD = ".paste-row input";

export function useDeletion({
  route,
  attend,
  announce,
  appOf,
  remove,
}: Readonly<{
  route: Route;
  attend: (attention: Attention) => void;
  announce: (text: string) => void;
  appOf: () => Element | null;
  remove: Writes["remove"];
}>): (item: Item) => Promise<void> {
  const { leave } = route;
  const opened = useLatest(route.openId);

  return useCallback(
    async (item: Item): Promise<void> => {
      announce("");

      let left = false;

      const survivor = await remove(item.id, (next) => {
        if (opened.current !== item.id) return;

        left = true;
        leave();
        attend(next === null ? null : { id: next, focus: true });
        announce(DELETED);
      });

      if (survivor === null && left) {
        appOf()?.querySelector<HTMLElement>(PASTE_FIELD)?.focus();
      }
    },
    [announce, appOf, attend, leave, opened, remove],
  );
}
