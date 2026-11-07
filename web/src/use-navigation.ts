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

type Stepping = Readonly<{
  list: ListState;
  route: Route;
  attend: (attention: Attention) => void;
  inReader: () => boolean;
  focusTitleOf: (id: number | null) => void;
  covers: boolean;
  appOf: () => Element | null;
}>;

function useStep({ list, route, attend, inReader, focusTitleOf, covers, appOf }: Stepping) {
  const { openId, replace } = route;

  return useCallback(
    (direction: 1 | -1) => {
      if (openId === null && covers) {
        focusNeighbourCard(appOf(), direction);

        return;
      }

      const next = neighbour(list, openId, direction);

      if (next !== null) {
        const fromReader = inReader();
        focusTitleOf(fromReader ? next : null);
        attend({ id: next, focus: !fromReader });
        replace(itemPath(next));
      }
    },
    [appOf, attend, covers, focusTitleOf, inReader, list, openId, replace],
  );
}

export function useNavigation({
  list,
  route,
  attend,
  inReader,
  covers,
  appOf,
}: Readonly<{
  list: ListState;
  route: Route;
  attend: (attention: Attention) => void;
  inReader: () => boolean;
  covers: boolean;
  appOf: () => Element | null;
}>) {
  const { openId, navigate, leave } = route;
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

  const step = useStep({ list, route, attend, inReader, focusTitleOf, covers, appOf });

  const previous = neighbour(list, openId, -1) !== null;
  const next = neighbour(list, openId, 1) !== null;
  const steps = useMemo(() => ({ previous, next }), [previous, next]);

  return { open, close, step, titleFocus, steps };
}
