import { useCallback, useEffect, useRef, useState } from "react";

import { NO_COUNTS } from "./import-api.ts";
import { type Outcome, type Progress, runImport } from "./import-run.ts";

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

const NO_RUN = 0;

function useActiveRun() {
  const active = useRef(NO_RUN);
  const issued = useRef(NO_RUN);
  const controller = useRef(new AbortController());

  const abort = useCallback(() => {
    controller.current.abort();
  }, []);

  useEffect(
    () => () => {
      active.current = NO_RUN;
      abort();
    },
    [abort],
  );

  const claim = useCallback((): { isActive: () => boolean; signal: AbortSignal } | null => {
    if (active.current !== NO_RUN) return null;

    issued.current += 1;

    const mine = issued.current;

    active.current = mine;
    controller.current = new AbortController();

    return { isActive: () => active.current === mine, signal: controller.current.signal };
  }, []);

  const release = useCallback(() => {
    active.current = NO_RUN;
  }, []);

  return { claim, release, abort };
}

export function useImportRun(seal: () => void) {
  const [state, setState] = useState<RunState>({ phase: "idle" });
  const { claim, release, abort } = useActiveRun();

  const start = useCallback(
    (links: readonly string[], name: string, from: Progress) => {
      const claimed = claim();

      if (claimed === null) return;

      const { isActive, signal } = claimed;

      const whileRunning = (change: (running: RunningState) => RunningState): void => {
        if (isActive()) setState((now) => (now.phase === "running" ? change(now) : now));
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

        if (isActive()) {
          release();
          setState({ phase: "ended", name, outcome });
        }
      };

      seal();
      setState({ phase: "running", name, progress: from, stopping: false, waiting: false });
      void run();
    },
    [claim, release, seal],
  );

  const stop = useCallback(() => {
    abort();
    setState((current) => (current.phase === "running" ? { ...current, stopping: true } : current));
  }, [abort]);

  return { state, start, stop };
}

export type ImportRun = Readonly<ReturnType<typeof useImportRun>>;
