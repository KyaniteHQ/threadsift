import { type RefObject, useCallback, useRef } from "react";

import { fetchItemsAfter } from "./api.ts";
import { type Filters, queryOf } from "./filters.ts";
import type { Stamps } from "./item-polling.ts";
import { type ListState, appended, continues, withMore } from "./list-state.ts";
import { useLatest } from "./use-latest.ts";

type SetList = (update: (current: ListState) => ListState) => void;

interface Wiring {
  readonly setList: SetList;
  readonly stamps: Stamps;
}

interface MoreWiring {
  readonly setList: SetList;
  readonly stamps: Stamps;
  readonly latest: Readonly<RefObject<ListState>>;
  readonly filtersNow: Readonly<RefObject<Filters>>;
  readonly flight: RefObject<string | null>;
}

async function readNext(
  { setList, stamps }: Readonly<MoreWiring>,
  asked: Readonly<Filters>,
  query: string,
  cursor: string,
): Promise<void> {
  setList((now) => withMore(now, query, cursor, "loading"));
  const startedAt = performance.now();
  const page = await fetchItemsAfter(asked, cursor).catch(() => null);

  if (page === null) {
    setList((now) => withMore(now, query, cursor, "failed"));

    return;
  }

  const present = { ...page, items: page.items.filter((item) => !stamps.isGone(item.id)) };
  const changed = stamps.changedSince(startedAt);
  setList((now) => appended(now, present, { query, cursor, changed }));
}

function startNext(paging: Readonly<MoreWiring>): void {
  const { latest, filtersNow, flight } = paging;
  const current = latest.current;
  const asked = filtersNow.current;
  const query = queryOf(asked);
  const cursor = current.status === "ready" ? current.next : null;

  if (cursor === null || !continues(current, query, cursor)) return;

  const key = `${query}|${cursor}`;

  if (flight.current === key) return;

  flight.current = key;

  void readNext(paging, asked, query, cursor).finally(() => {
    if (flight.current === key) flight.current = null;
  });
}

export function useMore(
  { setList, stamps }: Readonly<Wiring>,
  filters: Readonly<Filters>,
  latest: Readonly<RefObject<ListState>>,
) {
  const filtersNow = useLatest(filters);
  const flight = useRef<string | null>(null);

  return useCallback(() => {
    startNext({ setList, stamps, latest, filtersNow, flight });
  }, [filtersNow, latest, setList, stamps]);
}
