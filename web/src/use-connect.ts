import { useCallback, useState } from "react";

import { type AiView, startConnect } from "./ai-api.ts";
import { AI_TEXT } from "./ai-text.ts";
import type { FieldState } from "./use-form.ts";

export interface Connection {
  readonly connect: () => void;
  readonly leaving: boolean;
  readonly failure: string | null;
}

const FAILURE_TEXT = {
  stale: AI_TEXT.connectStale,
  unavailable: AI_TEXT.connectUnavailable,
  failed: AI_TEXT.connectFailed,
} as const;

export function useConnect(
  view: AiView,
  fields: Readonly<{ model: FieldState; key: FieldState }>,
  blocked: boolean,
): Connection {
  const [leaving, setLeaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { model, key } = fields;
  const { value: modelValue, fail: failModel } = model;
  const { clear: clearKey } = key;

  const run = useCallback(async () => {
    if (blocked || leaving) return;

    setFailure(null);
    failModel(null);

    if (modelValue.trim() === "") {
      failModel(AI_TEXT.connectModelNeeded);

      return;
    }

    setLeaving(true);

    try {
      const started = await startConnect({ model: modelValue, revision: view.revision });

      if (started.kind === "started") {
        clearKey();
        window.location.assign(started.authorizationUrl);

        return;
      }

      setFailure(FAILURE_TEXT[started.kind]);
    } catch {
      setFailure(FAILURE_TEXT.failed);
    }

    setLeaving(false);
  }, [blocked, leaving, modelValue, view.revision, failModel, clearKey]);

  const connect = useCallback(() => {
    void run();
  }, [run]);

  return { connect, leaving, failure };
}
