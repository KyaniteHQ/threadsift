import { useEffect, useState } from "react";

export interface Ticket {
  readonly take: () => AbortSignal;
  readonly current: () => AbortSignal;
}

function newTicket(): Ticket {
  let controller = new AbortController();

  return {
    take: () => {
      controller.abort();
      controller = new AbortController();

      return controller.signal;
    },
    current: () => controller.signal,
  };
}

export function useTicket(): Ticket {
  const [ticket] = useState(newTicket);

  useEffect(
    () => () => {
      ticket.take();
    },
    [ticket],
  );

  return ticket;
}
