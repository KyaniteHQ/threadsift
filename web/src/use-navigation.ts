import { useCallback, useMemo, useState } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import type { Route } from "./routing.ts";
import { useCardReturn } from "./use-card-return.ts";
import { type LibraryDom, hasMore, neighbour, useStep } from "./use-step.ts";

export type { LibraryDom };

import { changeView } from "./view-transition.ts";

export function useNavigation({
  list,
  route,
  attend,
  dom,
  covers,
  more,
  announce,
}: Readonly<{
  list: ListState;
  route: Route;
  attend: (attention: Attention) => void;
  dom: LibraryDom;
  covers: boolean;
  more: () => void;
  announce: (text: string, failed?: boolean) => void;
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

  const step = useStep({ list, route, attend, dom, focusTitleOf, covers, more, announce });

  const previous = neighbour(list, openId, -1) !== null;
  const next = neighbour(list, openId, 1) !== null || hasMore(list);
  const steps = useMemo(() => ({ previous, next }), [previous, next]);

  return { open, close, step, titleFocus, steps };
}
