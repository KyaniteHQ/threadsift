import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { fetchItems } from "./api.ts";
import type { Filters } from "./filters.ts";
import type { Stamps } from "./item-polling.ts";
import { type Answer, type ListState, failedList, loaded } from "./list-state.ts";
import { useLatest } from "./use-latest.ts";

type SetList = Dispatch<SetStateAction<ListState>>;

export interface Reads {
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

  useEffect(() => {
    const request = requests.list();

    const land = (answer: Readonly<Answer>): void => {
      const changed = stamps.changedSince(request.startedAt);
      const counts = requests.claimCounts(request, changed.length === 0);
      const present = { ...answer, items: answer.items.filter((item) => !stamps.isGone(item.id)) };
      setList((current) => loaded(current, present, { changed, counts }));

      if (changed.length > 0) recount(true);
    };

    const read = async (): Promise<void> => {
      const answer = await fetchItems(query.filters).catch(() => null);

      if (requests.isCurrent(request)) {
        requests.finish();

        if (answer === null) setList(failedList);
        else land(answer);
      }
    };

    void read();
  }, [query, recount, requests, setList, stamps]);
}

export function useReads(setList: SetList, filters: Readonly<Filters>, stamps: Stamps): Reads {
  const requests = useRequests();
  const wiring = useMemo(() => ({ setList, requests, stamps }), [setList, requests, stamps]);
  const [generation, setGeneration] = useState(0);
  const query = useMemo(() => ({ filters, generation }), [filters, generation]);

  const reload = useCallback(() => {
    setGeneration((now) => now + 1);
  }, []);

  const recount = useRecount(wiring, reload, filters);
  useListRead(query, wiring, recount);

  const settle = useCallback(
    (wanted: boolean) => {
      if (wanted || requests.isReading()) reload();
    },
    [reload, requests],
  );

  return useMemo(() => ({ reload, recount, settle }), [reload, recount, settle]);
}
