import { useCallback, useMemo, useState } from "react";

import { itemPath } from "../../src/core/contract/item-path.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import type { Route } from "./routing.ts";
import { useSharedArrival } from "./share-handoff.ts";
import { useCardReturn } from "./use-card-return.ts";
import { type LibraryDom, neighbour, useStep } from "./use-step.ts";
import { changeView } from "./view-transition.ts";

export function useNavigation({
  list,
  route,
  attend,
  dom,
  covers,
}: Readonly<{
  list: ListState;
  route: Route;
  attend: (attention: Attention) => void;
  dom: LibraryDom;
  covers: boolean;
}>) {
  const { openId, navigate, leave } = route;
  const { appOf } = dom;
  const [titleFocus, focusTitleOf] = useState<number | null>(null);

  const open = useCallback(
    (id: number) => {
      focusTitleOf(null);
      attend({ id, focus: !covers });

      changeView(appOf(), id, covers, () => {
        navigate(itemPath(id));
      });
    },
    [appOf, attend, covers, navigate],
  );

  const close = useCallback(() => {
    if (openId === null) return;

    changeView(appOf(), openId, covers, leave);
  }, [appOf, covers, leave, openId]);

  useSharedArrival(list.status === "ready", open);

  useCardReturn({ list, openId, covers, attend, appOf });

  const step = useStep({ list, route, attend, dom, focusTitleOf, covers });

  const previous = neighbour(list, openId, -1) !== null;
  const next = neighbour(list, openId, 1) !== null;
  const steps = useMemo(() => ({ previous, next }), [previous, next]);

  return { open, close, step, titleFocus, steps };
}
