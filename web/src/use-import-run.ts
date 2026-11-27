import { useCallback, useEffect, useRef, useState } from "react";

import { NO_COUNTS } from "./import-api.ts";
import { type Outcome, type Progress, runImport } from "./import-run.ts";
import type { Check } from "./use-import-list.ts";

type RunningState = {
  readonly phase: "running";
  readonly name: string;
  readonly progress: Progress;
  readonly stopping: boolean;
  readonly waiting: boolean;
};

export type RunState =
  | { readonly phase: "idle" }
  | RunningState
  | { readonly phase: "ended"; readonly name: string; readonly outcome: Outcome };

export const NOT_STARTED: Progress = { done: 0, counts: NO_COUNTS, uncounted: 0 };

const IDLE: RunState = { phase: "idle" };

export function shownRun(state: RunState, check: Check): RunState {
  if (state.phase === "running") return state;

  return state.phase === "ended" && check.status === "ready" && state.name === check.name
    ? state
    : IDLE;
}

export function useImportRun(seal: () => void) {
  const [state, setState] = useState<RunState>({ phase: "idle" });
  const controller = useRef(new AbortController());

  useEffect(
    () => () => {
      controller.current.abort();
    },
    [],
  );

  const start = useCallback(
    (links: readonly string[], name: string, from: Progress) => {
      controller.current = new AbortController();
      const { signal } = controller.current;

      const whileRunning = (change: (running: RunningState) => RunningState): void => {
        setState((now) => (now.phase === "running" ? change(now) : now));
      };

      const run = async (): Promise<void> => {
        const outcome = await runImport(links, name, from, {
          report: (progress) => {
            whileRunning((now) => ({ ...now, progress }));
          },
          waiting: (waiting) => {
            whileRunning((now) => ({ ...now, waiting }));
          },
          signal,
        });

        setState({ phase: "ended", name, outcome });
      };

      seal();
      setState({ phase: "running", name, progress: from, stopping: false, waiting: false });
      void run();
    },
    [seal],
  );

  const stop = useCallback(() => {
    controller.current.abort();
    setState((current) => (current.phase === "running" ? { ...current, stopping: true } : current));
  }, []);

  return { state, start, stop };
}

export type ImportRun = Readonly<ReturnType<typeof useImportRun>>;
