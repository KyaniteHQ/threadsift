import { useEffect, useRef } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import type { Route } from "./routing.ts";

export function useAutoOpen({
  list,
  path,
  openId,
  replace,
  wide,
  attend,
}: Readonly<{
  list: ListState;
  path: Route["path"];
  openId: Route["openId"];
  replace: Route["replace"];
  wide: boolean;
  attend: (attention: Attention) => void;
}>): void {
  const settled = useRef(false);

  useEffect(() => {
    if (settled.current || list.status !== "ready") return;

    if (window.location.pathname !== path) return;

    settled.current = true;

    const first = list.items.find((item) => item.readState === "unread");

    if (!wide || openId !== null || first === undefined) return;

    attend({ id: first.id, focus: false });
    replace(itemPath(first.id));
  }, [attend, list, openId, path, replace, wide]);
}
