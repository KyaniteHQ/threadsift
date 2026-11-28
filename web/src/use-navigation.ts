import { useCallback, useMemo, useState } from "react";

import { itemPath } from "../../src/core/contract/item-path.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import { READER_MOVE, useMotionAllowed } from "./reader-motion.ts";
import { type Route, onItem } from "./routing.ts";
import { useSharedArrival } from "./share-handoff.ts";
import { useCardReturn } from "./use-card-return.ts";
import { useLatest } from "./use-latest.ts";
import { type LibraryDom, neighbour, useStep } from "./use-step.ts";

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
  const { openId, navigate, replace, leave } = route;
  const { appOf } = dom;
  const [titleFocus, focusTitleOf] = useState<number | null>(null);
  const shown = useLatest(openId);
  const motionAllowed = useMotionAllowed();
  const moving = covers && motionAllowed;

  const open = useCallback(
    (id: number) => {
      focusTitleOf(null);
      attend({ id, focus: !covers });

      if (onItem() && shown.current === null) replace(itemPath(id), READER_MOVE);
      else navigate(itemPath(id), READER_MOVE);
    },
    [attend, covers, navigate, replace, shown],
  );

  const close = useCallback(() => {
    if (openId !== null) leave(READER_MOVE);
  }, [leave, openId]);

  useSharedArrival(list.status === "ready", open);

  useCardReturn({ list, openId, covers, attend, appOf });

  const step = useStep({ list, route, attend, dom, focusTitleOf, covers });

  const previous = neighbour(list, openId, -1) !== null;
  const next = neighbour(list, openId, 1) !== null;
  const steps = useMemo(() => ({ previous, next }), [previous, next]);

  return { open, close, step, titleFocus, steps, moving };
}
