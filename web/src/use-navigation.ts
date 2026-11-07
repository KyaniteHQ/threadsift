import { useCallback } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import type { Route } from "./routing.ts";
import { changeView } from "./view-transition.ts";

function neighbour(list: Readonly<ListState>, openId: number | null, direction: 1 | -1) {
  if (list.status !== "ready") return null;

  const ids = list.items.map((item) => item.id);
  const at = openId === null ? -1 : ids.indexOf(openId);

  if (at < 0) return (direction > 0 ? ids[0] : ids.at(-1)) ?? null;

  return ids[at + direction] ?? null;
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
  const { openId, navigate, replace } = route;

  const open = useCallback(
    (id: number) => {
      changeView(appOf(), id, covers, () => {
        navigate(itemPath(id));
      });
    },
    [appOf, covers, navigate],
  );

  const close = useCallback(() => {
    if (openId === null) return;

    changeView(appOf(), openId, covers, () => {
      attend({ id: openId, focus: true });
      navigate("/");
    });
  }, [appOf, attend, covers, navigate, openId]);

  const step = useCallback(
    (direction: 1 | -1) => {
      const next = neighbour(list, openId, direction);

      if (next !== null) {
        attend({ id: next, focus: !inReader() });
        replace(itemPath(next));
      }
    },
    [attend, inReader, list, openId, replace],
  );

  return { open, close, step };
}
