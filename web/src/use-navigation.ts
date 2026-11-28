import { useCallback, useMemo, useState } from "react";

import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import type { Route } from "./routing.ts";
import { useSharedArrival } from "./share-handoff.ts";
import { useCardReturn } from "./use-card-return.ts";
import { type LibraryDom, neighbour, useStep } from "./use-step.ts";

function useReaderCard(openId: number | null) {
  const [card, setCard] = useState(openId);

  if (openId !== null && openId !== card) setCard(openId);

  return [openId === null ? card : null, setCard] as const;
}

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
  const { openId, openItem, leave } = route;
  const { appOf } = dom;
  const [titleFocus, focusTitleOf] = useState<number | null>(null);
  const [readerCard, pickCard] = useReaderCard(openId);

  const open = useCallback(
    (id: number) => {
      focusTitleOf(null);
      attend({ id, focus: !covers });
      pickCard(id);
      openItem(id, "open");
    },
    [attend, covers, openItem, pickCard],
  );

  useSharedArrival(list.status === "ready", open);

  useCardReturn({ list, openId, covers, attend, appOf });

  const step = useStep({ list, route, attend, dom, focusTitleOf, covers });

  const previous = neighbour(list, openId, -1) !== null;
  const next = neighbour(list, openId, 1) !== null;
  const steps = useMemo(() => ({ previous, next }), [previous, next]);

  return {
    open,
    close: leave,
    step,
    titleFocus,
    steps,
    readerCard: covers ? readerCard : null,
  };
}
