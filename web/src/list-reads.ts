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

import { fetchItems, fetchItemsAfter } from "./api.ts";
import { type Filters, queryOf } from "./filters.ts";
import type { Stamps } from "./item-polling.ts";
import {
  type Answer,
  type ListState,
  appended,
  continues,
  failedList,
  loaded,
  withMore,
} from "./list-state.ts";
import { useLatest } from "./use-latest.ts";

type SetList = Dispatch<SetStateAction<ListState>>;

export interface Reads {
  readonly more: () => Promise<number | null>;
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

function useListRead(
  query: Readonly<{ filters: Filters; generation: number }>,
  wiring: Readonly<Wiring>,
  recount: (wanted: boolean) => void,
) {
  const { setList, requests, stamps } = wiring;
  const shown = useRef<string | null>(null);

  useEffect(() => {
    const request = requests.list();
    const asked = queryOf(query.filters);

    const land = (answer: Readonly<Omit<Answer, "query">>, keeps: boolean): void => {
      const changed = stamps.changedSince(request.startedAt);
      const counts = requests.claimCounts(request, changed.length === 0);

      const present = {
        ...answer,
        items: answer.items.filter((item) => !stamps.isGone(item.id)),
        query: asked,
      };

      setList((current) => loaded(current, present, { changed, counts, keeps }));

      if (changed.length > 0) recount(true);
    };

    const read = async (): Promise<void> => {
      const answer = await fetchItems(query.filters).catch(() => null);

      if (requests.isCurrent(request)) {
        requests.finish();

        if (answer === null) {
          setList((current) =>
            current.status === "ready" && shown.current === asked ? current : failedList(current),
          );
        } else {
          const keeps = shown.current === asked;
          shown.current = asked;
          land(answer, keeps);
        }
      }
    };

    void read();
  }, [query, recount, requests, setList, stamps]);
}

interface Flight {
  readonly key: string;
  readonly promise: Promise<number | null>;
}

interface MoreWiring {
  readonly setList: SetList;
  readonly stamps: Stamps;
  readonly latest: Readonly<RefObject<ListState>>;
  readonly filtersNow: Readonly<RefObject<Filters>>;
  readonly flight: RefObject<Flight | null>;
}

async function readNext(
  { setList, stamps, latest }: Readonly<MoreWiring>,
  asked: Readonly<Filters>,
  query: string,
  cursor: string,
): Promise<number | null> {
  setList((now) => withMore(now, query, cursor, "loading"));
  const page = await fetchItemsAfter(asked, cursor).catch(() => null);

  if (page === null) {
    setList((now) => withMore(now, query, cursor, "failed"));

    return null;
  }

  const present = { ...page, items: page.items.filter((item) => !stamps.isGone(item.id)) };
  const before = latest.current;
  setList((now) => appended(now, present, query, cursor));

  if (!continues(before, query, cursor)) return null;

  const have = new Set(before.items.map((item) => item.id));

  return present.items.find((item) => !have.has(item.id))?.id ?? null;
}

function startNext(paging: Readonly<MoreWiring>): Promise<number | null> {
  const { latest, filtersNow, flight } = paging;
  const current = latest.current;
  const asked = filtersNow.current;
  const query = queryOf(asked);
  const cursor = current.status === "ready" ? current.next : null;

  if (cursor === null || !continues(current, query, cursor)) return Promise.resolve(null);

  const key = `${query}|${cursor}`;

  if (flight.current?.key === key) return flight.current.promise;

  const promise = readNext(paging, asked, query, cursor).finally(() => {
    if (flight.current?.promise === promise) flight.current = null;
  });

  flight.current = { key, promise };

  return promise;
}

function useMore(
  { setList, stamps }: Readonly<Wiring>,
  filters: Readonly<Filters>,
  latest: Readonly<RefObject<ListState>>,
) {
  const filtersNow = useLatest(filters);
  const flight = useRef<Flight | null>(null);

  return useCallback(
    () => startNext({ setList, stamps, latest, filtersNow, flight }),
    [filtersNow, latest, setList, stamps],
  );
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
  useListRead(query, wiring, recount);
  const more = useMore(wiring, filters, latest);

  const settle = useCallback(
    (wanted: boolean) => {
      if (wanted || requests.isReading()) reload();
    },
    [reload, requests],
  );

  return useMemo(() => ({ more, reload, recount, settle }), [more, reload, recount, settle]);
}
