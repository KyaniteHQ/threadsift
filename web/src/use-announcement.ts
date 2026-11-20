import { useCallback, useState } from "react";

import type { ReadState } from "../../src/core/contract/item-contract.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import type { Writes } from "./library.ts";
import { MARKED_READ, MARKED_UNREAD, READ_FAILED } from "./reader-text.ts";

const OTHER: Readonly<Record<ReadState, ReadState>> = { read: "unread", unread: "read" };

const MARKED: Readonly<Record<ReadState, string>> = { read: MARKED_READ, unread: MARKED_UNREAD };

export type Announcement = Readonly<{ text: string; failed: boolean }>;

function newReadWrites() {
  const wanted = new Map<number, ReadState>();
  const tails = new Map<number, Promise<void>>();

  return {
    latest: (id: number): ReadState | undefined => wanted.get(id),
    queue: (id: number, state: ReadState, write: () => Promise<void>): void => {
      wanted.set(id, state);

      const run: Promise<void> = (tails.get(id) ?? Promise.resolve()).then(write).finally(() => {
        if (tails.get(id) === run) {
          tails.delete(id);
          wanted.delete(id);
        }
      });

      tails.set(id, run);
    },
  } as const;
}

export function useAnnouncement(setRead: Writes["setRead"]) {
  const [announcement, setAnnouncement] = useState<Announcement>({ text: "", failed: false });
  const [writes] = useState(newReadWrites);

  const toggleRead = useCallback(
    (item: Readonly<Item>): void => {
      const wanted = OTHER[writes.latest(item.id) ?? item.readState];

      writes.queue(item.id, wanted, async () => {
        const failed = await setRead(item.id, wanted).then(
          () => false,
          () => true,
        );

        setAnnouncement({ text: failed ? READ_FAILED : MARKED[wanted], failed });
      });
    },
    [setRead, writes],
  );

  const announce = useCallback((text: string, failed = false): void => {
    setAnnouncement({ text, failed });
  }, []);

  return { announcement, announce, toggleRead };
}
