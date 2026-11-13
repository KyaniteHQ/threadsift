import { useMemo, useRef } from "react";

export interface Ticket {
  readonly take: () => number;
  readonly now: () => number;
  readonly matches: (mine: number) => boolean;
}

export function useTicket(): Ticket {
  const count = useRef(0);

  return useMemo(
    () => ({
      take: () => {
        count.current += 1;

        return count.current;
      },
      now: () => count.current,
      matches: (mine) => count.current === mine,
    }),
    [],
  );
}
