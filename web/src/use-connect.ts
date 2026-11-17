import { useCallback } from "react";

import { type AiView, startConnect } from "./ai-api.ts";
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
): Connection {
  const { phase, run, refuse } = flow;
  const { model, key } = fields;
  const { value: modelValue, fail: failModel } = model;
  const { clear: clearKey } = key;
  const { secretReady, revision } = view;

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
