import { useEffect } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { fetchItem } from "./api.ts";

const POLL_MS = 1000;
const SLOW_POLL_MS = 5000;
const FAST_POLLS = 10;

function scheduleRead(reads: number, pause: () => void, read: () => Promise<void>): number {
  return window.setTimeout(
    () => {
      if (document.hidden) pause();
      else void read();
    },
    reads < FAST_POLLS ? POLL_MS : SLOW_POLL_MS,
  );
}

function pollItem(
  id: number,
  onRead: (item: Readonly<Item>, startedAt: number) => void,
): () => void {
  let timer = 0;
  let stopped = false;
  let paused = false;
  let reads = 0;

  const schedule = (): void => {
    timer = scheduleRead(
      reads,
      () => {
        paused = true;
      },
      read,
    );
  };

  const read = async (): Promise<void> => {
    reads += 1;
    const startedAt = performance.now();
    const item = await fetchItem(id).catch(() => null);

    if (!stopped) {
      if (item !== null) {
        onRead(item, startedAt);
      }

      schedule();
    }
  };

  const resume = (): void => {
    if (paused && !document.hidden) {
      paused = false;
      void read();
    }
  };

  document.addEventListener("visibilitychange", resume);
  schedule();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", resume);
  };
}

export function useItemPolling(
  ids: string,
  onRead: (item: Readonly<Item>, startedAt: number) => void,
): void {
  useEffect(() => {
    const stops = (ids === "" ? [] : ids.split(",")).map((id) => pollItem(Number(id), onRead));

    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  }, [ids, onRead]);
}

export function newStamps() {
  const times = new Map<number, number>();

  return {
    mark: (id: number): void => {
      times.set(id, performance.now());
    },
    isFresh: (id: number, startedAt: number): boolean => startedAt > (times.get(id) ?? 0),
    changedSince: (startedAt: number): number[] =>
      [...times].flatMap(([id, markedAt]) => (markedAt > startedAt ? [id] : [])),
  } as const;
}

export type Stamps = ReturnType<typeof newStamps>;
