import { useMemo, useState } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import type { BarMode } from "./bar-fit.ts";
import type { Attention } from "./ItemRow.tsx";
import type { Writes } from "./library.ts";
import type { ListState } from "./list-state.ts";
import type { Route } from "./routing.ts";
import { type Announcement, useAnnouncement } from "./use-announcement.ts";
import { useDeletion } from "./use-deletion.ts";
import { useNavigation } from "./use-navigation.ts";
import type { Look } from "./use-root.ts";
import type { LibraryDom } from "./use-step.ts";

export interface ReaderControls {
  readonly mode: BarMode;
  readonly settingsKey: string;
  readonly titleFocus: number | null;
  readonly toggleRead: (item: Item) => void;
  readonly remove: (item: Item) => Promise<void>;
  readonly forget: (id: number) => void;
  readonly announce: (text: string) => void;
  readonly close: () => void;
  readonly hintPlaced: (inBar: boolean) => void;
}

function modeOf(look: Readonly<Look>): ReaderControls["mode"] {
  return look.phone ? "phone" : look.reader;
}

export interface ReaderState {
  readonly open: (id: number) => void;
  readonly close: () => void;
  readonly step: (direction: 1 | -1) => void;
  readonly toggleRead: ReaderControls["toggleRead"];
  readonly controls: ReaderControls;
  readonly steps: Readonly<{ previous: boolean; next: boolean }>;
  readonly hintInBar: boolean;
  readonly announcement: Announcement;
}

function useControls({
  look,
  navigation,
  toggleRead,
  remove,
  forget,
  announce,
  hintPlaced,
}: Readonly<{
  look: Look;
  navigation: Readonly<Pick<ReturnType<typeof useNavigation>, "close" | "titleFocus">>;
  toggleRead: ReaderControls["toggleRead"];
  remove: ReaderControls["remove"];
  forget: ReaderControls["forget"];
  announce: ReaderControls["announce"];
  hintPlaced: ReaderControls["hintPlaced"];
}>): ReaderControls {
  const { close, titleFocus } = navigation;
  const mode = modeOf(look);
  const settingsKey = JSON.stringify(look.settings);

  return useMemo<ReaderControls>(
    () => ({
      mode,
      settingsKey,
      titleFocus,
      toggleRead,
      remove,
      forget,
      announce,
      close,
      hintPlaced,
    }),
    [announce, close, forget, hintPlaced, mode, remove, settingsKey, titleFocus, toggleRead],
  );
}

export function useReaderControls({
  list,
  route,
  look,
  attend,
  writes,
  dom,
}: Readonly<{
  list: ListState;
  route: Route;
  look: Look;
  attend: (attention: Attention) => void;
  writes: Writes;
  dom: LibraryDom;
}>): ReaderState {
  const [hintInBar, setHintInBar] = useState(false);
  const { announcement, announce, toggleRead } = useAnnouncement(writes.setRead);
  const remove = useDeletion({ route, attend, announce, appOf: dom.appOf, remove: writes.remove });

  const navigation = useNavigation({
    list,
    route,
    attend,
    dom,
    covers: look.reader !== "pane",
  });

  const controls = useControls({
    look,
    navigation,
    toggleRead,
    remove,
    forget: writes.forget,
    announce,
    hintPlaced: setHintInBar,
  });

  return {
    open: navigation.open,
    close: navigation.close,
    step: navigation.step,
    toggleRead,
    controls,
    steps: navigation.steps,
    hintInBar,
    announcement,
  };
}
