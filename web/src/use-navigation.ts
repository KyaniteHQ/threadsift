import { useCallback, useMemo, useState } from "react";

import { itemPath } from "../../src/core/contract/item-path.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import type { Route } from "./routing.ts";
import { useSharedArrival } from "./share-handoff.ts";
import { useCardReturn } from "./use-card-return.ts";
import { type LibraryDom, neighbour, useStep } from "./use-step.ts";
import { useReaderMotion } from "./view-transition.ts";

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
  const { openId } = route;
  const { appOf } = dom;
  const [titleFocus, focusTitleOf] = useState<number | null>(null);
  const { move, named } = useReaderMotion({ route, covers, appOf });

  const open = useCallback(
    (id: number) => {
      focusTitleOf(null);
      attend({ id, focus: !covers });

      move("open", id, (writes) => {
        writes.navigate(itemPath(id));
      });
    },
    [attend, covers, move],
  );

  const close = useCallback(() => {
    if (openId === null) return;

    move("close", openId, (writes) => {
      writes.leave();
    });
  }, [move, openId]);

  useSharedArrival(list.status === "ready", open);

  useCardReturn({ list, openId, covers, attend, appOf });

  const step = useStep({ list, route, attend, dom, focusTitleOf, covers });

  const previous = neighbour(list, openId, -1) !== null;
  const next = neighbour(list, openId, 1) !== null;
  const steps = useMemo(() => ({ previous, next }), [previous, next]);

  return { open, close, step, titleFocus, steps, named };
}
