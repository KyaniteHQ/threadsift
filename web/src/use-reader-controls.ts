import { useCallback, useMemo, useState } from "react";

import type { ReadState } from "../../src/core/kinds.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import { MARKED_READ, MARKED_UNREAD, READ_FAILED } from "./reader-text.ts";
import type { ReaderControls } from "./Reader.tsx";
import type { Route } from "./routing.ts";
import { useNavigation } from "./use-navigation.ts";
import type { Look } from "./use-root.ts";

const OTHER: Readonly<Record<ReadState, ReadState>> = { read: "unread", unread: "read" };

function modeOf(look: Readonly<Look>): ReaderControls["mode"] {
  if (look.phone) return "phone";

  return look.narrow ? "page" : "pane";
}

const MARKED: Readonly<Record<ReadState, string>> = { read: MARKED_READ, unread: MARKED_UNREAD };

function useAnnouncement(setRead: (id: number, state: ReadState) => Promise<void>) {
  const [announcement, setAnnouncement] = useState<Readonly<{ text: string; failed: boolean }>>({
    text: "",
    failed: false,
  });

  const toggleRead = useCallback(
    (item: Readonly<Item>): void => {
      const wanted = OTHER[item.readState];

      const settle = async (): Promise<void> => {
        const failed = await setRead(item.id, wanted).then(
          () => false,
          () => true,
        );

        setAnnouncement({ text: failed ? READ_FAILED : MARKED[wanted], failed });
      };

      void settle();
    },
    [setRead],
  );

  return { announcement, toggleRead };
}

export interface ReaderState {
  readonly open: (id: number) => void;
  readonly close: () => void;
  readonly step: (direction: 1 | -1) => void;
  readonly toggleRead: (item: Item) => void;
  readonly controls: ReaderControls;
  readonly hintInBar: boolean;
  readonly announcement: Readonly<{ text: string; failed: boolean }>;
}

export function useReaderControls({
  list,
  route,
  look,
  attend,
  setRead,
  inReader,
  appOf,
}: Readonly<{
  list: ListState;
  route: Route;
  look: Look;
  attend: (attention: Attention) => void;
  setRead: (id: number, state: ReadState) => Promise<void>;
  inReader: () => boolean;
  appOf: () => Element | null;
}>): ReaderState {
  const [hintInBar, setHintInBar] = useState(false);
  const { announcement, toggleRead } = useAnnouncement(setRead);

  const navigation = useNavigation({
    list,
    route,
    attend,
    inReader,
    appOf,
    covers: look.narrow,
  });

  const { close, titleFocus } = navigation;
  const mode = modeOf(look);
  const settingsKey = JSON.stringify(look.settings);

  const controls = useMemo<ReaderControls>(
    () => ({ mode, settingsKey, titleFocus, toggleRead, close, hintPlaced: setHintInBar }),
    [close, mode, settingsKey, titleFocus, toggleRead],
  );

  return {
    open: navigation.open,
    close,
    step: navigation.step,
    toggleRead,
    controls,
    hintInBar,
    announcement,
  };
}
