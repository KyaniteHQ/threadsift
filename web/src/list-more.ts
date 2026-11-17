import { type RefObject, useCallback } from "react";

import { fetchItemsAfter } from "./api.ts";
import { type Filters, queryOf } from "./filters.ts";
import { type ListState, type Wiring, appended, continues, withMore } from "./list-state.ts";
import { useLatest } from "./use-latest.ts";

interface MoreWiring extends Wiring {
  readonly latest: Readonly<RefObject<ListState>>;
  readonly filtersNow: Readonly<RefObject<Filters>>;
}

async function readNext(
  { setList, ticket }: Readonly<MoreWiring>,
  asked: Readonly<Filters>,
  query: string,
  cursor: string,
): Promise<void> {
  setList((now) => withMore(now, query, cursor, "loading"));
  const mine = ticket.now();
  const page = await fetchItemsAfter(asked, cursor).catch(() => null);

  if (!ticket.matches(mine)) return;

  if (page === null) {
    setList((now) => withMore(now, query, cursor, "failed"));

    return;
  }

  setList((now) => appended(now, page, { query, cursor }));
}

function startNext(paging: Readonly<MoreWiring>): void {
  const { latest, filtersNow } = paging;
  const current = latest.current;
  const asked = filtersNow.current;
  const query = queryOf(asked);
  const cursor = current.status === "ready" ? current.next : null;

  if (cursor === null || !continues(current, query, cursor)) return;

  if (current.more === "loading") return;

  void readNext(paging, asked, query, cursor);
}

export function useMore(
  { setList, ticket }: Readonly<Wiring>,
  filters: Readonly<Filters>,
  latest: Readonly<RefObject<ListState>>,
) {
  const filtersNow = useLatest(filters);

  return useCallback(() => {
    startNext({ setList, ticket, latest, filtersNow });
  }, [filtersNow, latest, setList, ticket]);
}
