import { type Dispatch, useCallback, useEffect, useReducer } from "react";
import { flushSync } from "react-dom";

import type { Digest } from "../../src/core/contract/digest-schema.ts";
import {
  ConnectNoticeSchema,
  NOTICE_PARAMETER,
  type ConnectNotice,
} from "../../src/core/contract/openrouter-contract.ts";
import { AI_TEXT } from "./ai-text.ts";
import { useGuard } from "./use-form.ts";

export type Outcome =
  | { readonly kind: "ok"; readonly text: string; readonly digest?: Digest }
  | { readonly kind: "error"; readonly text: string };

export type Phase = "idle" | "saving" | "verifying" | "waiting" | "connecting" | "leaving";

type Working = Exclude<Phase, "idle" | "leaving">;

export const LEAVING = "leaving";

const FAILED = {
  saving: AI_TEXT.saveFailed,
  verifying: AI_TEXT.verifyFailed,
  waiting: AI_TEXT.verifyFailed,
  connecting: AI_TEXT.connectFailed,
} as const satisfies Record<Working, string>;

interface FormState {
  readonly phase: Phase;
  readonly outcome: Outcome | null;
  readonly notice: ConnectNotice | null;
}

type Event =
  | { readonly kind: "begin"; readonly phase: Working }
  | { readonly kind: "leave" }
  | { readonly kind: "settle"; readonly outcome: Outcome }
  | { readonly kind: "refuse"; readonly outcome: Outcome }
  | { readonly kind: "clear" }
  | { readonly kind: "restore" };

function noticeOf(search: string): ConnectNotice | null {
  const parsed = ConnectNoticeSchema.safeParse(new URLSearchParams(search).get(NOTICE_PARAMETER));

  return parsed.success ? parsed.data : null;
}

function start(): FormState {
  return { phase: "idle", outcome: null, notice: noticeOf(window.location.search) };
}

function reduce(state: FormState, event: Event): FormState {
  if (event.kind === "begin") return { phase: event.phase, outcome: null, notice: null };

  if (event.kind === "leave") return { ...state, phase: "leaving" };

  if (event.kind === "settle") return { ...state, phase: "idle", outcome: event.outcome };

  if (event.kind === "refuse") {
    return state.phase === "idle" ? { ...state, outcome: event.outcome } : state;
  }

  if (event.kind === "clear") {
    return state.phase === "idle" ? { ...state, outcome: null, notice: null } : state;
  }

  if (event.kind === "restore") {
    return state.phase === LEAVING ? { ...state, phase: "idle" } : state;
  }

  const exhaustive: never = event;

  return exhaustive;
}

export type Task = () => Promise<Outcome | typeof LEAVING>;

function useRefusals(dispatch: Dispatch<Event>) {
  const refuse = useCallback(
    (text: string) => {
      dispatch({ kind: "refuse", outcome: { kind: "error", text } });
    },
    [dispatch],
  );

  const clear = useCallback(() => {
    dispatch({ kind: "clear" });
  }, [dispatch]);

  return { refuse, clear };
}

export function useAiPhase() {
  const [state, dispatch] = useReducer(reduce, undefined, start);
  const { phase, notice } = state;
  const { guard } = useGuard(phase === LEAVING);
  const noticed = notice !== null;

  useEffect(() => {
    if (noticed) window.history.replaceState(null, "", window.location.pathname);
  }, [noticed]);

  useEffect(() => {
    const onPageShow = (event: Readonly<PageTransitionEvent>): void => {
      if (event.persisted) dispatch({ kind: "restore" });
    };

    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const { refuse, clear } = useRefusals(dispatch);

  const run = useCallback(
    (next: Working, task: Task) => {
      guard(async () => {
        dispatch({ kind: "begin", phase: next });

        try {
          const done = await task();

          if (done === LEAVING) {
            flushSync(() => {
              dispatch({ kind: "leave" });
            });
          } else dispatch({ kind: "settle", outcome: done });
        } catch {
          dispatch({ kind: "settle", outcome: { kind: "error", text: FAILED[next] } });
        }
      });
    },
    [guard],
  );

  return { phase, outcome: state.outcome, notice, run, refuse, clear };
}

export type AiPhase = ReturnType<typeof useAiPhase>;
