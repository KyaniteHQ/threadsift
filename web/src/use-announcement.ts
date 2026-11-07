import { useCallback, useState } from "react";

import type { ReadState } from "../../src/core/kinds.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { Applied, Writes } from "./library.ts";
import { MARKED_READ, MARKED_UNREAD, READ_FAILED } from "./reader-text.ts";

const OTHER: Readonly<Record<ReadState, ReadState>> = { read: "unread", unread: "read" };

const MARKED: Readonly<Record<ReadState, string>> = { read: MARKED_READ, unread: MARKED_UNREAD };

export type Announcement = Readonly<{ text: string; failed: boolean }>;

export function useAnnouncement(setRead: Writes["setRead"]) {
  const [announcement, setAnnouncement] = useState<Announcement>({ text: "", failed: false });

  const toggleRead = useCallback(
    (item: Readonly<Item>): void => {
      const wanted = OTHER[item.readState];

      const settle = async (): Promise<void> => {
        const answer: Applied | "failed" = await setRead(item.id, wanted).then(
          (applied) => applied,
          (): "failed" => "failed",
        );

        if (answer === "discarded") return;

        const failed = answer === "failed";
        setAnnouncement({ text: failed ? READ_FAILED : MARKED[wanted], failed });
      };

      void settle();
    },
    [setRead],
  );

  const announce = useCallback((text: string): void => {
    setAnnouncement({ text, failed: false });
  }, []);

  return { announcement, announce, toggleRead };
}
