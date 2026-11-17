import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { fetchItems, fetchItemsAfter } from "./api.ts";
import { type Filters, queryOf } from "./filters.ts";
import { useMore } from "./list-more.ts";
import { newer } from "./list-paging.ts";
import {
  type ListState,
  type SetList,
  type Wiring,
  failedList,
  type Page,
  loaded,
  readFor,
} from "./list-state.ts";
import { type Ticket, useTicket } from "./use-ticket.ts";

export interface Reads {
  readonly more: () => void;
  readonly reload: () => void;
  readonly ticket: Ticket;
}

interface Reach {
  readonly edge: () => Item | undefined;
  readonly isCurrent: () => boolean;
}

function edgeOf(list: Readonly<ListState>, asked: string): Item | undefined {
  return readFor(list, asked) ? list.items.at(-1) : undefined;
}

async function continuing(
  filters: Readonly<Filters>,
  page: Readonly<Page>,
  reach: Readonly<Reach>,
): Promise<Page> {
  const last = page.items.at(-1);
  const edge = reach.edge();

  if (
    page.next === null ||
    !reach.isCurrent() ||
    last === undefined ||
    edge === undefined ||
    !newer(last, edge)
  ) {
    return page;
  }

  const following = await continuing(filters, await fetchItemsAfter(filters, page.next), reach);

  return { items: [...page.items, ...following.items], next: following.next };
}

async function readThrough(filters: Readonly<Filters>, reach: Readonly<Reach>) {
  const first = await fetchItems(filters);

  return { ...first, ...(await continuing(filters, first, reach)) };
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
    };

    const read = async (): Promise<void> => {
      const answer = await readThrough(query.filters, reach).catch(() => null);

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
