import { useCallback, useEffect, useMemo, useState } from "react";

import type { Item, ItemDetail } from "../../src/http/schemas.ts";
import { fetchItemDetail } from "./api.ts";

export type DetailState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly detail: ItemDetail; readonly stale: boolean };

type Answer = Readonly<{ id: number; state: Exclude<DetailState, { status: "loading" }> }>;

const LOADING: DetailState = { status: "loading" };

export function refreshKey(item: Readonly<Item>): string {
  return [item.status, item.fetchedAt, item.title, item.digestTitle, item.digestOutcome].join("|");
}

const FAILED: Answer["state"] = { status: "failed" };

function ready(detail: ItemDetail): Answer["state"] {
  return { status: "ready", detail, stale: false };
}

export function useItemDetail(id: number, refresh: string) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ id, refresh, attempt }), [id, refresh, attempt]);

  useEffect(() => {
    let current = true;

    const read = async (): Promise<void> => {
      const state = await fetchItemDetail(request.id).then(ready, () => FAILED);

      if (current) {
        setAnswer((was) =>
          state.status === "failed" && was?.id === request.id && was.state.status === "ready"
            ? { id: request.id, state: { ...was.state, stale: true } }
            : { id: request.id, state },
        );
      }
    };

    void read();

    return () => {
      current = false;
    };
  }, [request]);

  const retry = useCallback(() => {
    setAnswer(null);
    setAttempt((now) => now + 1);
  }, []);

  const state: DetailState = answer?.id === id ? answer.state : LOADING;

  return { state, retry };
}
