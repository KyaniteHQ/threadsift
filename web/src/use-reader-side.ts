import { type RefObject, useCallback } from "react";

import type { ReadState } from "../../src/core/kinds.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { Attention } from "./ItemRow.tsx";
import { type ListState, knownItems } from "./list-state.ts";
import type { Route } from "./routing.ts";
import { useLibraryKeys } from "./use-library-keys.ts";
import { type ReaderState, useReaderControls } from "./use-reader-controls.ts";
import type { Look } from "./use-root.ts";

function useKeyActions({
  list,
  openId,
  covered,
  reader,
  searchField,
}: Readonly<{
  list: ListState;
  openId: number | null;
  covered: boolean;
  reader: ReaderState;
  searchField: RefObject<HTMLInputElement | null>;
}>) {
  useLibraryKeys({
    openId,
    covered,
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

export interface ReaderSide {
  readonly reader: ReaderState;
  readonly leaveSearch: () => void;
  readonly openFromCard: (id: number) => void;
}

export function useReaderSide({
  list,
  look,
  route,
  setRead,
  attend,
  root,
  searchField,
  covered,
}: Readonly<{
  list: ListState;
  look: Look;
  route: Route;
  setRead: (id: number, state: ReadState) => Promise<void>;
  attend: (attention: Attention) => void;
  root: RefObject<HTMLDivElement | null>;
  searchField: RefObject<HTMLInputElement | null>;
  covered: boolean;
}>): ReaderSide {
  const inReader = useCallback(
    () => root.current?.querySelector(".reader-slot")?.contains(document.activeElement) === true,
    [root],
  );

  const appOf = useCallback(() => root.current?.closest(".app") ?? null, [root]);
  const reader = useReaderControls({ list, route, look, attend, setRead, inReader, appOf });
  const { openId } = route;

  const leaveSearch = useCallback(() => {
    if (openId === null) root.current?.querySelector<HTMLElement>(".list")?.focus();
    else attend({ id: openId, focus: true });
  }, [attend, openId, root]);

  const openFromCard = useCallback(
    (id: number) => {
      attend({ id, focus: !look.narrow });
      reader.open(id);
    },
    [attend, look.narrow, reader],
  );

  useKeyActions({ list, openId, covered, reader, searchField });

  return { reader, leaveSearch, openFromCard };
}
