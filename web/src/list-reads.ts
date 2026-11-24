import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";

import type { ItemList, ItemPage } from "../../src/core/contract/item-route-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { fetchItems, fetchItemsAfter } from "./api.ts";
import { type Filters, queryOf } from "./filters.ts";
import { useMore } from "./list-more.ts";
import { newer } from "./list-paging.ts";
import {
  type ListState,
  type SetList,
  type Wiring,
  failedList,
  loaded,
  readFor,
} from "./list-state.ts";
import { readThrough } from "./read-through.ts";
import { type Ticket, useTicket } from "./use-ticket.ts";

export interface Reads {
  readonly more: () => void;
  readonly reload: () => void;
  readonly ticket: Ticket;
}

interface Reach {
  readonly edge: () => Item | undefined;
  readonly isCurrent: () => boolean;
  readonly signal: AbortSignal;
}

function edgeOf(list: Readonly<ListState>, asked: string): Item | undefined {
  return readFor(list, asked) ? list.items.at(-1) : undefined;
}

function reached(page: Readonly<ItemPage>, reach: Readonly<Reach>): boolean {
  const last = page.items.at(-1);
  const edge = reach.edge();

  return !reach.isCurrent() || last === undefined || edge === undefined || !newer(last, edge);
}

function joined(shown: Readonly<ItemList>, added: Readonly<ItemPage>): ItemList {
  return { ...shown, items: [...shown.items, ...added.items], next: added.next };
}

async function readItems(filters: Readonly<Filters>, reach: Readonly<Reach>) {
  return readThrough(await fetchItems(filters, reach.signal), {
    read: (cursor) => fetchItemsAfter(filters, cursor, reach.signal),
    joined,
    covers: (shown) => reached(shown, reach),
  });
}

function useListRead(
  query: Readonly<{ filters: Filters; generation: number }>,
  wiring: Readonly<Wiring>,
  latest: Readonly<RefObject<ListState>>,
) {
  const { setList, ticket } = wiring;

  useEffect(() => {
    const mine = ticket.take();
    const asked = queryOf(query.filters);

    const reach = {
      edge: () => edgeOf(latest.current, asked),
      isCurrent: () => ticket.matches(mine),
      signal: ticket.signal(),
    };

    const read = async (): Promise<void> => {
      const answer = await readItems(query.filters, reach).catch(() => null);

      if (!ticket.matches(mine)) return;

      if (answer === null) {
        setList(failedList);
      } else {
        setList((current) => loaded(current, { ...answer, query: asked }));
      }
    };

    void read();

    return () => {
      ticket.take();
    };
  }, [latest, query, ticket, setList]);
}

export function useReads(
  setList: SetList,
  filters: Readonly<Filters>,
  latest: Readonly<RefObject<ListState>>,
): Reads {
  const ticket = useTicket();
  const wiring = useMemo(() => ({ setList, ticket }), [setList, ticket]);
  const [generation, setGeneration] = useState(0);
  const query = useMemo(() => ({ filters, generation }), [filters, generation]);

  const reload = useCallback(() => {
    ticket.take();
    setGeneration((now) => now + 1);
  }, [ticket]);

  useListRead(query, wiring, latest);
  const more = useMore(wiring, filters, latest);

  return useMemo(() => ({ more, reload, ticket }), [more, reload, ticket]);
}
