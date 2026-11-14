import { useCallback, useEffect, useReducer } from "react";
import { flushSync } from "react-dom";

import type { Digest } from "../../src/core/ai-contract.ts";
import {
  ConnectNoticeSchema,
  NOTICE_PARAMETER,
  type ConnectNotice,
} from "../../src/core/openrouter-contract.ts";
import { AI_TEXT } from "./ai-text.ts";
import { useAfter, useGuard } from "./use-form.ts";

const LEAVE_WAIT_MS = 10_000;

export type Outcome =
  | { readonly kind: "ok"; readonly text: string; readonly digest?: Digest }
  | { readonly kind: "error"; readonly text: string };

export type Phase = "idle" | "saving" | "verifying" | "waiting" | "connecting" | "leaving";

type Working = Exclude<Phase, "idle" | "leaving">;

export const LEAVING = "leaving";

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

  return state.phase === "leaving" ? { ...state, phase: "idle" } : state;
}

export type Task = () => Promise<Outcome | typeof LEAVING>;

export function useAiPhase() {
  const [state, dispatch] = useReducer(reduce, undefined, start);
  const { phase, notice } = state;
  const { guard } = useGuard(phase === LEAVING);
  const noticed = notice !== null;

  const restore = useCallback(() => {
    dispatch({ kind: "restore" });
  }, []);

  const report = useCallback((outcome: Outcome) => {
    dispatch({ kind: "settle", outcome });
  }, []);

  useAfter(phase === LEAVING, LEAVE_WAIT_MS, restore);

  useEffect(() => {
    if (noticed) window.history.replaceState(null, "", window.location.pathname);
  }, [noticed]);

  const refuse = useCallback((text: string) => {
    dispatch({ kind: "refuse", outcome: { kind: "error", text } });
  }, []);

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
          dispatch({ kind: "settle", outcome: { kind: "error", text: AI_TEXT.failed } });
        }
      });
    },
    [guard],
  );

  return { phase, outcome: state.outcome, notice, run, restore, report, refuse };
}

export type AiPhase = ReturnType<typeof useAiPhase>;
