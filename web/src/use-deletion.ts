import { useCallback } from "react";

import type { Item } from "../../src/http/schemas.ts";
import type { Attention } from "./ItemRow.tsx";
import type { Writes } from "./library.ts";
import { DELETED } from "./reader-text.ts";
import type { Route } from "./routing.ts";

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

  return useCallback(
    async (item: Item): Promise<void> => {
      announce("");

      const survivor = await remove(item.id, (next) => {
        leave();
        attend(next === null ? null : { id: next, focus: true });
        announce(DELETED);
      });

      if (survivor === null) appOf()?.querySelector<HTMLElement>(PASTE_FIELD)?.focus();
    },
    [announce, appOf, attend, leave, remove],
  );
}
