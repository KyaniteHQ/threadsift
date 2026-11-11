import { useCallback, useEffect, useRef, useState } from "react";

import { NO_COUNTS } from "./import-api.ts";
import { type Outcome, type Progress, runImport } from "./import-run.ts";

export type RunState =
  | { readonly phase: "idle" }
  | {
      readonly phase: "running";
      readonly name: string;
      readonly progress: Progress;
      readonly stopping: boolean;
    }
  | { readonly phase: "ended"; readonly name: string; readonly outcome: Outcome };

export const NOT_STARTED: Progress = { done: 0, counts: NO_COUNTS };

const NO_RUN = 0;

function useActiveRun() {
  const active = useRef(NO_RUN);
  const issued = useRef(NO_RUN);

  useEffect(
    () => () => {
      active.current = NO_RUN;
    },
    [],
  );

  const claim = useCallback((): (() => boolean) | null => {
    if (active.current !== NO_RUN) return null;

    issued.current += 1;

    const mine = issued.current;

    active.current = mine;

    return () => active.current === mine;
  }, []);

  const release = useCallback(() => {
    active.current = NO_RUN;
  }, []);

  return { claim, release };
}

export function useImportRun(seal: () => void) {
  const [state, setState] = useState<RunState>({ phase: "idle" });
  const stopRequested = useRef(false);
  const { claim, release } = useActiveRun();

  const start = useCallback(
    (links: readonly string[], name: string, from: Progress) => {
      const isActive = claim();

      if (isActive === null) return;

      const run = async (): Promise<void> => {
        const outcome = await runImport(
          links,
          name,
          from,
          (progress) => {
            if (isActive()) {
              setState((now) => (now.phase === "running" ? { ...now, progress } : now));
            }
          },
          () => stopRequested.current || !isActive(),
        );

        if (isActive()) {
          release();
          setState({ phase: "ended", name, outcome });
        }
      };

      stopRequested.current = false;
      seal();
      setState({ phase: "running", name, progress: from, stopping: false });
      void run();
    },
    [claim, release, seal],
  );

  const stop = useCallback(() => {
    stopRequested.current = true;
    setState((current) => (current.phase === "running" ? { ...current, stopping: true } : current));
  }, []);

  return { state, start, stop };
}

export type ImportRun = Readonly<ReturnType<typeof useImportRun>>;
