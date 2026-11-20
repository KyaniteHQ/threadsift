import { useEffect, useState } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { type ItemRead, readStatus } from "./item-reads.ts";
import type { Ticket } from "./use-ticket.ts";

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
  readonly ticket: Ticket;
  readonly onRead: (item: Readonly<Item>) => void;
  readonly onGone: (id: number) => void;
}

function deliver(id: number, answer: Readonly<ItemRead>, polled: Readonly<Polled>) {
  if (answer === "gone") {
    polled.onGone(id);

    return false;
  }

  polled.memory.answered(id, answer.wait);
  polled.onRead(answer);

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
    const mine = polled.ticket.now();
    const fetched = await readStatus(id, wanted).catch(() => FAILED);

    if (fetched === null || stopped) return;

    if (!polled.ticket.matches(mine) || fetched === FAILED || deliver(id, fetched, polled))
      schedule();
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
  ticket: Ticket,
): void {
  const [memory] = useState(newPollMemory);

  useEffect(() => {
    const polled = ids === "" ? [] : ids.split(",").map(Number);

    memory.keepOnly(polled);

    const stops = polled.map((id) => pollItem(id, { memory, onRead, onGone, ticket }));

    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  }, [memory, ids, onRead, onGone, ticket]);
}
