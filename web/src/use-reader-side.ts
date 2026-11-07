import { type RefObject, useCallback } from "react";

import type { Item } from "../../src/http/schemas.ts";
import type { Attention } from "./ItemRow.tsx";
import type { Writes } from "./library.ts";
import { type ListState, knownItems } from "./list-state.ts";
import type { Route } from "./routing.ts";
import { useAutoOpen } from "./use-auto-open.ts";
import { useLibraryKeys } from "./use-library-keys.ts";
import { type ReaderState, useReaderControls } from "./use-reader-controls.ts";
import type { Look } from "./use-root.ts";

function useKeyActions({
  list,
  openId,
  covered,
  arrows,
  reader,
  searchField,
}: Readonly<{
  list: ListState;
  openId: number | null;
  covered: boolean;
  arrows: boolean;
  reader: ReaderState;
  searchField: RefObject<HTMLInputElement | null>;
}>) {
  useLibraryKeys({
    openId,
    covered,
    arrows,
    step: reader.step,
    toggle: (id: number) => {
      const item = knownItems(list).find((each: Readonly<Item>) => each.id === id);

      if (item !== undefined) reader.toggleRead(item);
    },
    close: reader.close,
    focusSearch: () => {
      searchField.current?.focus();
    },
  });
}

function useLibraryDom(root: RefObject<HTMLDivElement | null>) {
  const inReader = useCallback(
    () =>
      [...(root.current?.querySelectorAll(".reader-slot, .side-nav") ?? [])].some((part) =>
        part.contains(document.activeElement),
      ),
    [root],
  );

  const appOf = useCallback(() => root.current?.closest(".app") ?? null, [root]);

  return { inReader, appOf };
}

export interface ReaderSide {
  readonly reader: ReaderState;
  readonly leaveSearch: () => void;
  readonly openFromCard: (id: number) => void;
}

export function useReaderSide({
  list,
  look,
  route,
  writes,
  attend,
  root,
  searchField,
  covered,
}: Readonly<{
  list: ListState;
  look: Look;
  route: Route;
  writes: Writes;
  attend: (attention: Attention) => void;
  root: RefObject<HTMLDivElement | null>;
  searchField: RefObject<HTMLInputElement | null>;
  covered: boolean;
}>): ReaderSide {
  const { inReader, appOf } = useLibraryDom(root);
  const reader = useReaderControls({ list, route, look, attend, writes, inReader, appOf });
  const { openId, replace } = route;

  useAutoOpen({ list, openId, replace, wide: look.reader === "pane", attend });

  const leaveSearch = useCallback(() => {
    if (openId === null) root.current?.querySelector<HTMLElement>(".list")?.focus();
    else attend({ id: openId, focus: true });
  }, [attend, openId, root]);

  const openFromCard = useCallback(
    (id: number) => {
      attend({ id, focus: look.reader === "pane" });
      reader.open(id);
    },
    [attend, look.reader, reader],
  );

  useKeyActions({
    list,
    openId,
    covered,
    arrows: look.settings.layout === "grid",
    reader,
    searchField,
  });

  return { reader, leaveSearch, openFromCard };
}
