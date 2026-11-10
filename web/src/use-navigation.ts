import { useCallback, useMemo, useState } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import { focusNeighbourCard } from "./reveal.ts";
import type { Route } from "./routing.ts";
import { useCardReturn } from "./use-card-return.ts";
import { changeView } from "./view-transition.ts";

function neighbour(list: Readonly<ListState>, openId: number | null, direction: 1 | -1) {
  if (list.status !== "ready") return null;

  const ids = list.items.map((item) => item.id);
  const at = openId === null ? -1 : ids.indexOf(openId);

  if (at < 0) return (direction > 0 ? ids[0] : ids.at(-1)) ?? null;

  return ids[at + direction] ?? null;
}

function hasMore(list: Readonly<ListState>): boolean {
  return list.status === "ready" && list.next !== null;
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
  more: () => Promise<number | null>;
}>;

function useStep({ list, route, attend, dom, focusTitleOf, covers, more }: Stepping) {
  const { openId, replace } = route;
  const { inReader, appOf } = dom;

  return useCallback(
    (direction: 1 | -1) => {
      const cardsOnly = openId === null && covers;

      const goTo = (id: number): void => {
        const fromReader = inReader();
        focusTitleOf(fromReader ? id : null);
        attend({ id, focus: !fromReader });
        replace(itemPath(id));
      };

      const afterNextPage = async (): Promise<void> => {
        const id = await more();

        if (id === null) return;

        if (cardsOnly) attend({ id, focus: true });
        else goTo(id);
      };

      if (cardsOnly) {
        if (!focusNeighbourCard(appOf(), direction) && direction > 0 && hasMore(list)) {
          void afterNextPage();
        }

        return;
      }

      const next = neighbour(list, openId, direction);

      if (next !== null) goTo(next);
      else if (direction > 0 && hasMore(list)) void afterNextPage();
    },
    [appOf, attend, covers, focusTitleOf, inReader, list, more, openId, replace],
  );
}

export function useNavigation({
  list,
  route,
  attend,
  dom,
  covers,
  more,
}: Readonly<{
  list: ListState;
  route: Route;
  attend: (attention: Attention) => void;
  dom: LibraryDom;
  covers: boolean;
  more: () => Promise<number | null>;
}>) {
  const { openId, navigate, leave } = route;
  const { appOf } = dom;
  const [titleFocus, focusTitleOf] = useState<number | null>(null);

  const open = useCallback(
    (id: number) => {
      focusTitleOf(null);

      changeView(appOf(), id, covers, () => {
        navigate(itemPath(id));
      });
    },
    [appOf, covers, navigate],
  );

  const close = useCallback(() => {
    if (openId === null) return;

    changeView(appOf(), openId, covers, leave);
  }, [appOf, covers, leave, openId]);

  useCardReturn({ list, openId, covers, attend, appOf });

  const step = useStep({ list, route, attend, dom, focusTitleOf, covers, more });

  const previous = neighbour(list, openId, -1) !== null;
  const next = neighbour(list, openId, 1) !== null || hasMore(list);
  const steps = useMemo(() => ({ previous, next }), [previous, next]);

  return { open, close, step, titleFocus, steps };
}
