import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Item } from "../../src/http/schemas.ts";
import { fetchItems, fetchItemsAfter } from "./api.ts";
import { type Filters, queryOf } from "./filters.ts";
import type { Stamps } from "./item-polling.ts";
import { useMore } from "./list-more.ts";
import { type Answer, type ListState, failedList, type Page, loaded, newer } from "./list-state.ts";
import { useLatest } from "./use-latest.ts";

type SetList = Dispatch<SetStateAction<ListState>>;

export interface Reads {
  readonly more: () => void;
  readonly reload: () => void;
  readonly recount: (wanted: boolean) => void;
  readonly settle: (wanted: boolean) => void;
}

interface Request {
  readonly generation: number;
  readonly ticket: number;
  readonly startedAt: number;
}

function useRequests() {
  const generation = useRef(0);
  const clock = useRef(0);
  const countsFrom = useRef(0);
  const reading = useRef(false);

  return useMemo(() => {
    const issue = (): Request => {
      clock.current += 1;

      return {
        generation: generation.current,
        ticket: clock.current,
        startedAt: performance.now(),
      };
    };

    return {
      list: (): Request => {
        generation.current += 1;
        reading.current = true;

        return issue();
      },
      counts: issue,
      isReading: () => reading.current,
      finish: () => {
        reading.current = false;
      },
      isCurrent: (request: Readonly<Request>) => request.generation === generation.current,
      claimCounts: (request: Readonly<Request>, unchanged: boolean) => {
        const claimed = unchanged && request.ticket > countsFrom.current;

        if (claimed) countsFrom.current = request.ticket;

        return claimed;
      },
    };
  }, []);
}

type Requests = Readonly<ReturnType<typeof useRequests>>;

interface Wiring {
  readonly setList: SetList;
  readonly requests: Requests;
  readonly stamps: Stamps;
}

function useRecount(wiring: Readonly<Wiring>, reload: () => void, filters: Readonly<Filters>) {
  const { setList, requests, stamps } = wiring;
  const filtersNow = useLatest(filters);

  return useCallback(
    (wanted: boolean) => {
      if (!wanted) return;

      const request = requests.counts();

      const run = async (): Promise<void> => {
        const answer = await fetchItems(filtersNow.current).catch(() => null);
        const unchanged = stamps.changedSince(request.startedAt).length === 0;

        if (answer === null) reload();
        else if (requests.isCurrent(request) && requests.claimCounts(request, unchanged)) {
          setList((current) =>
            current.status === "ready" ? { ...current, counts: answer.counts } : current,
          );
        }
      };

      void run();
    },
    [filtersNow, reload, requests, setList, stamps],
  );
}

interface Reach {
  readonly edge: () => Item | undefined;
  readonly isCurrent: () => boolean;
}

function edgeOf(list: Readonly<ListState>, asked: string): Item | undefined {
  return list.status === "ready" && list.query === asked ? list.items.at(-1) : undefined;
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

function landing(
  { setList, requests, stamps }: Readonly<Wiring>,
  request: Readonly<Request>,
  asked: string,
  recount: (wanted: boolean) => void,
) {
  return (answer: Readonly<Omit<Answer, "query">>): void => {
    const changed = stamps.changedSince(request.startedAt);
    const counts = requests.claimCounts(request, changed.length === 0);

    const present = {
      ...answer,
      items: answer.items.filter((item) => !stamps.isGone(item.id)),
      query: asked,
    };

    setList((current) => loaded(current, present, { changed, counts }));

    if (changed.length > 0) recount(true);
  };
}

function useListRead(
  query: Readonly<{ filters: Filters; generation: number }>,
  wiring: Readonly<Wiring>,
  recount: (wanted: boolean) => void,
  latest: Readonly<RefObject<ListState>>,
) {
  const { setList, requests } = wiring;

  useEffect(() => {
    const request = requests.list();
    const asked = queryOf(query.filters);

    const reach = {
      edge: () => edgeOf(latest.current, asked),
      isCurrent: () => requests.isCurrent(request),
    };

    const land = landing(wiring, request, asked, recount);

    const read = async (): Promise<void> => {
      const answer = await readThrough(query.filters, reach).catch(() => null);

      if (!requests.isCurrent(request)) return;

      requests.finish();

      if (answer === null) {
        setList((current) =>
          current.status === "ready" && current.query === asked ? current : failedList(current),
        );
      } else {
        land(answer);
      }
    };

    void read();
  }, [latest, query, recount, requests, setList, wiring]);
}

export function useReads(
  setList: SetList,
  filters: Readonly<Filters>,
  stamps: Stamps,
  latest: Readonly<RefObject<ListState>>,
): Reads {
  const requests = useRequests();
  const wiring = useMemo(() => ({ setList, requests, stamps }), [setList, requests, stamps]);
  const [generation, setGeneration] = useState(0);
  const query = useMemo(() => ({ filters, generation }), [filters, generation]);

  const reload = useCallback(() => {
    setGeneration((now) => now + 1);
  }, []);

  const recount = useRecount(wiring, reload, filters);
  useListRead(query, wiring, recount, latest);
  const more = useMore(wiring, filters, latest);

  const settle = useCallback(
    (wanted: boolean) => {
      if (wanted || requests.isReading()) reload();
    },
    [reload, requests],
  );

  return useMemo(() => ({ more, reload, recount, settle }), [more, reload, recount, settle]);
}
