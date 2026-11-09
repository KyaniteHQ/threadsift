import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { HighlightsView } from "../../src/core/highlight-contract.ts";
import type { Item, ItemDetail } from "../../src/http/schemas.ts";
import { fetchItemDetail } from "./api.ts";

export type DetailState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly detail: ItemDetail; readonly stale: boolean };

type Answer = Readonly<{ id: number; state: Exclude<DetailState, { status: "loading" }> }>;

export interface DetailActions {
  readonly retry: () => void;
  readonly reload: () => void;
  readonly editHighlights: (edit: (view: HighlightsView) => HighlightsView) => void;
}

const LOADING: DetailState = { status: "loading" };

export function refreshKey(item: Readonly<Item>): string {
  return [item.status, item.fetchedAt, item.title, item.digestTitle, item.digestOutcome].join("|");
}

const FAILED: Answer["state"] = { status: "failed" };

function ready(detail: ItemDetail): Answer["state"] {
  return { status: "ready", detail, stale: false };
}

function useActions(
  setAnswer: Dispatch<SetStateAction<Answer | null>>,
  setAttempt: Dispatch<SetStateAction<number>>,
): DetailActions {
  const retry = useCallback(() => {
    setAnswer(null);
    setAttempt((now) => now + 1);
  }, [setAnswer, setAttempt]);

  const reload = useCallback(() => {
    setAttempt((now) => now + 1);
  }, [setAttempt]);

  const editHighlights = useCallback(
    (edit: (view: HighlightsView) => HighlightsView) => {
      setAnswer((was) => {
        if (was === null || was.state.status !== "ready") return was;

        const { detail } = was.state;

        return {
          id: was.id,
          state: { ...was.state, detail: { ...detail, highlights: edit(detail.highlights) } },
        };
      });
    },
    [setAnswer],
  );

  return useMemo(() => ({ retry, reload, editHighlights }), [retry, reload, editHighlights]);
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

  const actions = useActions(setAnswer, setAttempt);
  const state: DetailState = answer?.id === id ? answer.state : LOADING;

  return { state, actions };
}
