import { useCallback, useEffect, useMemo, useRef } from "react";

import { type AiView, fetchAiSettings, startConnect } from "./ai-api.ts";
import { AI_TEXT } from "./ai-text.ts";
import { type AiPhase, LEAVING, type Outcome } from "./use-ai-phase.ts";
import type { FieldState } from "./use-form.ts";

export interface Connection {
  readonly connect: () => void;
  readonly connecting: boolean;
}

const FAILURE_TEXT = {
  stale: AI_TEXT.connectStale,
  unavailable: AI_TEXT.connectUnavailable,
  failed: AI_TEXT.connectFailed,
} as const;

function failure(text: string): Outcome {
  return { kind: "error", text };
}

export function useSaveOrder(saved: (view: AiView) => void) {
  const started = useRef(0);
  const accepted = useRef(0);
  const reads = useRef(0);

  return useMemo(
    () => ({
      saveStarted: (): void => {
        started.current += 1;
      },
      saveAccepted: (view: AiView): void => {
        accepted.current += 1;
        saved(view);
      },
      readStarted: () => {
        reads.current += 1;

        const at = { read: reads.current, started: started.current, accepted: accepted.current };
        const newest = (): boolean => at.read === reads.current;

        return {
          mayApply: (): boolean => newest() && at.accepted === accepted.current,
          mayFail: (): boolean => newest() && at.started === started.current,
        };
      },
    }),
    [saved],
  );
}

export type SaveOrder = Readonly<ReturnType<typeof useSaveOrder>>;

function usePageRestore(
  { restore, refuse }: Readonly<Pick<AiPhase, "restore" | "refuse">>,
  order: SaveOrder,
  restored: (view: AiView) => void,
): void {
  useEffect(() => {
    const reload = async (): Promise<void> => {
      restore();

      const read = order.readStarted();

      try {
        const view = await fetchAiSettings();

        if (read.mayApply()) restored(view);
      } catch {
        if (read.mayFail()) refuse(FAILURE_TEXT.failed);
      }
    };

    const onPageShow = (event: Readonly<PageTransitionEvent>): void => {
      if (event.persisted) void reload();
    };

    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [restore, refuse, restored, order]);
}

async function start(
  input: Readonly<{ model: string; revision: number }>,
): Promise<{ readonly url: string } | { readonly failure: string }> {
  try {
    const started = await startConnect(input);

    return started.kind === "started"
      ? { url: started.authorizationUrl }
      : { failure: FAILURE_TEXT[started.kind] };
  } catch {
    return { failure: FAILURE_TEXT.failed };
  }
}

export function useConnect(
  view: AiView,
  fields: Readonly<{ model: FieldState; key: FieldState }>,
  flow: Readonly<AiPhase>,
  restored: (view: AiView) => void,
  order: SaveOrder,
): Connection {
  const { phase, run, refuse } = flow;
  const { model, key } = fields;
  const { value: modelValue, fail: failModel } = model;
  const { clear: clearKey } = key;
  const { secretReady, revision } = view;
  usePageRestore(flow, order, restored);

  const connect = useCallback(() => {
    if (!secretReady) {
      refuse(AI_TEXT["secret-missing"]);

      return;
    }

    failModel(null);

    if (modelValue.trim() === "") {
      failModel(AI_TEXT.connectModelNeeded);

      return;
    }

    run("connecting", async () => {
      const started = await start({ model: modelValue, revision });

      if ("failure" in started) return failure(started.failure);

      clearKey();
      window.location.assign(started.url);

      return LEAVING;
    });
  }, [secretReady, modelValue, revision, failModel, clearKey, run, refuse]);

  return { connect, connecting: phase === "connecting" || phase === LEAVING };
}
