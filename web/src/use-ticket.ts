import { useState } from "react";

export interface Ticket {
  readonly take: () => number;
  readonly now: () => number;
  readonly matches: (mine: number) => boolean;
  readonly signal: () => AbortSignal;
}

function newTicket(): Ticket {
  let count = 0;
  let abort: AbortController | null = null;

  return {
    take: () => {
      abort?.abort();
      abort = null;
      count += 1;

      return count;
    },
    now: () => count,
    matches: (mine) => count === mine,
    signal: () => {
      abort ??= new AbortController();

      return abort.signal;
    },
  };
}

export function useTicket(): Ticket {
  const [ticket] = useState(newTicket);

  return ticket;
}
