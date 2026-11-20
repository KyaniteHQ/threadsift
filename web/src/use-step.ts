import { useCallback } from "react";

import { itemPath } from "../../src/core/contract/item-path.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import { focusNeighbourCard } from "./reveal.ts";
import { type Route, onItem } from "./routing.ts";

export function neighbour(list: Readonly<ListState>, openId: number | null, direction: 1 | -1) {
  if (list.status !== "ready") return null;

  const ids = list.items.map((item) => item.id);
  const at = openId === null ? -1 : ids.indexOf(openId);

  if (at < 0) return (direction > 0 ? ids[0] : ids.at(-1)) ?? null;

  return ids[at + direction] ?? null;
}

export interface LibraryDom {
  readonly inReader: () => boolean;
  readonly appOf: () => Element | null;
}

type Stepping = Readonly<{
  list: ListState;
  route: Route;
  attend: (attention: Attention) => void;
  dom: LibraryDom;
  focusTitleOf: (id: number | null) => void;
  covers: boolean;
}>;

function useGoTo({
  route,
  attend,
  dom,
  focusTitleOf,
}: Pick<Stepping, "route" | "attend" | "dom" | "focusTitleOf">) {
  const { navigate, replace } = route;
  const { inReader } = dom;

  return useCallback(
    (id: number): void => {
      const fromReader = inReader();
      focusTitleOf(fromReader ? id : null);
      attend({ id, focus: !fromReader });

      if (onItem()) replace(itemPath(id));
      else navigate(itemPath(id));
    },
    [attend, focusTitleOf, inReader, navigate, replace],
  );
}

export function useStep({ list, route, attend, dom, focusTitleOf, covers }: Stepping) {
  const { openId } = route;
  const { appOf } = dom;
  const goTo = useGoTo({ route, attend, dom, focusTitleOf });

  return useCallback(
    (direction: 1 | -1) => {
      if (openId === null && covers) {
        focusNeighbourCard(appOf(), direction);

        return;
      }

      const id = neighbour(list, openId, direction);

      if (id !== null) goTo(id);
    },
    [appOf, covers, goTo, list, openId],
  );
}
