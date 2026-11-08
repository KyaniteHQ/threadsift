import { useCallback, useEffect, useState } from "react";

import { type AiView, fetchAiSettings, startConnect } from "./ai-api.ts";
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

function usePageRestore(
  restored: (view: AiView) => void,
  setLeaving: (leaving: boolean) => void,
  setFailure: (failure: string | null) => void,
): void {
  useEffect(() => {
    const restore = async (): Promise<void> => {
      setLeaving(false);

      try {
        restored(await fetchAiSettings());
      } catch {
        setFailure(FAILURE_TEXT.failed);
      }
    };

    const onPageShow = (event: Readonly<PageTransitionEvent>): void => {
      if (event.persisted) void restore();
    };

    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [restored, setLeaving, setFailure]);
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
  blocked: boolean,
  restored: (view: AiView) => void,
): Connection {
  const [leaving, setLeaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { model, key } = fields;
  const { value: modelValue, fail: failModel } = model;
  const { clear: clearKey } = key;
  usePageRestore(restored, setLeaving, setFailure);

  const run = useCallback(async () => {
    if (blocked || leaving) return;

    setFailure(null);
    failModel(null);

    if (modelValue.trim() === "") {
      failModel(AI_TEXT.connectModelNeeded);

      return;
    }

    setLeaving(true);
    const started = await start({ model: modelValue, revision: view.revision });

    if ("url" in started) {
      clearKey();
      window.location.assign(started.url);

      return;
    }

    setFailure(started.failure);
    setLeaving(false);
  }, [blocked, leaving, modelValue, view.revision, failModel, clearKey]);

  const connect = useCallback(() => {
    void run();
  }, [run]);

  return { connect, leaving, failure };
}
