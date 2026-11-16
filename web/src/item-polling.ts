import { useEffect, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { type ItemRead, readStatus } from "./item-reads.ts";

const POLL_MS = 1000;
const SLOW_POLL_MS = 5000;
const FAST_POLLS = 10;
const WAIT_POLL_MAX_MS = 60_000;
const FAILED = "failed" as const;

type Wait = Item["wait"];

function pauseAfter({ reads, wait }: Readonly<Seen>): number {
  const normal = reads < FAST_POLLS ? POLL_MS : SLOW_POLL_MS;

  return wait === null
    ? normal
    : Math.max(normal, Math.min(wait.retryAt - Date.now(), WAIT_POLL_MAX_MS));
}

interface Seen {
  readonly reads: number;
  readonly wait: Wait;
}

function newPollMemory() {
  const seen = new Map<number, Seen>();
  const of = (id: number): Seen => seen.get(id) ?? { reads: 0, wait: null };

  return {
    pauseFor: (id: number): number => pauseAfter(of(id)),
    started: (id: number): void => {
      seen.set(id, { ...of(id), reads: of(id).reads + 1 });
    },
    answered: (id: number, wait: Wait): void => {
      seen.set(id, { ...of(id), wait });
    },
    keepOnly: (ids: readonly number[]): void => {
      for (const id of seen.keys()) {
        if (!ids.includes(id)) seen.delete(id);
      }
    },
  } as const;
}

type PollMemory = ReturnType<typeof newPollMemory>;

interface Polled {
  readonly memory: PollMemory;
  readonly onRead: (item: Readonly<Item>, startedAt: number) => void;
  readonly onGone: (id: number) => void;
}

function deliver(id: number, { answer, startedAt }: Readonly<ItemRead>, polled: Readonly<Polled>) {
  if (answer === "gone") {
    polled.onGone(id);

    return false;
  }

  polled.memory.answered(id, answer.wait);
  polled.onRead(answer, startedAt);

  return true;
}

function pollItem(id: number, polled: Readonly<Polled>): () => void {
  const { memory } = polled;
  let timer = 0;
  let stopped = false;
  let paused = false;

  const schedule = (): void => {
    timer = window.setTimeout(() => {
      if (document.hidden) paused = true;
      else void read();
    }, memory.pauseFor(id));
  };

  const wanted = (): boolean => {
    paused = !stopped && document.hidden;

    if (stopped || paused) return false;

    memory.started(id);

    return true;
  };

  const read = async (): Promise<void> => {
    const fetched = await readStatus(id, wanted).catch(() => FAILED);

    if (fetched === null || stopped) return;

    if (fetched === FAILED || deliver(id, fetched, polled)) schedule();
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
  onRead: Polled["onRead"],
  onGone: Polled["onGone"],
): void {
  const [memory] = useState(newPollMemory);

  useEffect(() => {
    const polled = ids === "" ? [] : ids.split(",").map(Number);

    memory.keepOnly(polled);

    const stops = polled.map((id) => pollItem(id, { memory, onRead, onGone }));

    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  }, [memory, ids, onRead, onGone]);
}

export function newStamps() {
  const times = new Map<number, number>();
  const gone = new Set<number>();

  return {
    mark: (id: number): void => {
      times.set(id, performance.now());
    },
    remove: (id: number): void => {
      gone.add(id);
      times.set(id, performance.now());
    },
    isGone: (id: number): boolean => gone.has(id),
    isFresh: (id: number, startedAt: number): boolean => startedAt > (times.get(id) ?? 0),
    changedSince: (startedAt: number): number[] =>
      [...times].flatMap(([id, markedAt]) => (markedAt > startedAt ? [id] : [])),
  } as const;
}

export type Stamps = ReturnType<typeof newStamps>;
