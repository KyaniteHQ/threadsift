import { useMemo, useState } from "react";

import type { Attention } from "./ItemRow.tsx";
import type { Writes } from "./library.ts";
import type { ListState } from "./list-state.ts";
import type { ReaderControls } from "./Reader.tsx";
import type { Route } from "./routing.ts";
import { type Announcement, useAnnouncement } from "./use-announcement.ts";
import { useDeletion } from "./use-deletion.ts";
import { useNavigation } from "./use-navigation.ts";
import type { Look } from "./use-root.ts";

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

export function useReaderControls({
  list,
  route,
  look,
  attend,
  writes,
  inReader,
  appOf,
}: Readonly<{
  list: ListState;
  route: Route;
  look: Look;
  attend: (attention: Attention) => void;
  writes: Writes;
  inReader: () => boolean;
  appOf: () => Element | null;
}>): ReaderState {
  const [hintInBar, setHintInBar] = useState(false);
  const { announcement, announce, toggleRead } = useAnnouncement(writes.setRead);
  const remove = useDeletion({ route, attend, announce, appOf, remove: writes.remove });

  const navigation = useNavigation({
    list,
    route,
    attend,
    inReader,
    appOf,
    covers: look.reader !== "pane",
  });

  const { close, titleFocus } = navigation;
  const mode = modeOf(look);
  const settingsKey = JSON.stringify(look.settings);

  const controls = useMemo<ReaderControls>(
    () => ({ mode, settingsKey, titleFocus, toggleRead, remove, close, hintPlaced: setHintInBar }),
    [close, mode, remove, settingsKey, titleFocus, toggleRead],
  );

  return {
    open: navigation.open,
    close,
    step: navigation.step,
    toggleRead,
    controls,
    steps: navigation.steps,
    hintInBar,
    announcement,
  };
}
