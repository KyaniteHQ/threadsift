import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import type { HighlightsView } from "../../src/core/contract/highlight-contract.ts";
import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { fetchItemDetail } from "./api.ts";

export type Copy = "current" | "earlier" | "rereading";

export type DetailState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly detail: ItemDetail; readonly copy: Copy };

type Answer = Readonly<{ id: number; state: Exclude<DetailState, { status: "loading" }> }>;

export interface DetailActions {
  readonly retry: () => void;
  readonly reload: () => void;
  readonly editHighlights: (edit: (view: HighlightsView) => HighlightsView) => void;
}

const LOADING: DetailState = { status: "loading" };

export function refreshKey(item: Readonly<Item>): string {
  const counts = item.commentCount;

  return [
    item.status,
    item.fetchedAt,
    item.title,
    item.digestTitle,
    item.digestOutcome,
    counts?.filter,
    counts?.shown,
    counts?.total,
  ].join("|");
}

const FAILED: Answer["state"] = { status: "failed" };

function ready(detail: ItemDetail): Answer["state"] {
  return { status: "ready", detail, copy: "current" };
}

function rereading(was: Answer | null): Answer | null {
  return was?.state.status === "ready"
    ? { id: was.id, state: { ...was.state, copy: "rereading" } }
    : null;
}

function settled(was: Answer | null, id: number, state: Answer["state"]): Answer {
  if (was?.id !== id || was.state.status !== "ready") return { id, state };

  return state.status === "failed"
    ? { id, state: { ...was.state, copy: "earlier" } }
    : { id, state };
}

function useActions(
  setAnswer: Dispatch<SetStateAction<Answer | null>>,
  setAttempt: Dispatch<SetStateAction<number>>,
  noteEdit: () => void,
  shown: DetailState,
): DetailActions {
  const busy = shown.status === "ready" && shown.copy === "rereading";

  const retry = useCallback(() => {
    if (busy) return;

    setAnswer(rereading);
    setAttempt((now) => now + 1);
  }, [busy, setAnswer, setAttempt]);

  const reload = useCallback(() => {
    setAttempt((now) => now + 1);
  }, [setAttempt]);

  const editHighlights = useCallback(
    (edit: (view: HighlightsView) => HighlightsView) => {
      noteEdit();
      setAnswer((was) => {
        if (was === null || was.state.status !== "ready") return was;

        const { detail } = was.state;

        return {
          id: was.id,
          state: { ...was.state, detail: { ...detail, highlights: edit(detail.highlights) } },
        };
      });
    },
    [setAnswer, noteEdit],
  );

  return useMemo(() => ({ retry, reload, editHighlights }), [retry, reload, editHighlights]);
}

export function useItemDetail(id: number, refresh: string, forget: (id: number) => void) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const edits = useRef(0);

  const noteEdit = useCallback(() => {
    edits.current += 1;
  }, []);

  const request = useMemo(() => ({ id, refresh, attempt }), [id, refresh, attempt]);
  const gone = useEffectEvent(forget);

  useEffect(() => {
    let current = true;
    const edited = edits.current;

    const read = async (): Promise<void> => {
      const found = await fetchItemDetail(request.id).catch(() => null);

      if (!current) return;

      if (found === "gone") {
        gone(request.id);
      } else if (edits.current === edited) {
        const state = found === null ? FAILED : ready(found);

        setAnswer((was) => settled(was, request.id, state));
      } else {
        setAttempt((now) => now + 1);
      }
    };

    void read();

    return () => {
      current = false;
    };
  }, [request]);

  const state: DetailState = answer?.id === id ? answer.state : LOADING;
  const actions = useActions(setAnswer, setAttempt, noteEdit, state);

  return { state, actions };
}
