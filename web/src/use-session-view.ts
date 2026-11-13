import { useCallback, useEffect, useRef } from "react";

import { fetchSession } from "./access-api.ts";
import { UNREACHABLE, type SessionEvent, reduceSession, startSession } from "./session-state.ts";
import { useSignedOutListener } from "./signed-out.ts";
import { useFlow } from "./use-flow.ts";

const CHECK_DEADLINE_MS = 10_000;

async function readSession(check: Readonly<AbortController>) {
  try {
    return await fetchSession(
      AbortSignal.any([check.signal, AbortSignal.timeout(CHECK_DEADLINE_MS)]),
    );
  } catch {
    return UNREACHABLE;
  }
}

async function answer(check: Readonly<AbortController>, send: (event: SessionEvent) => boolean) {
  send({ kind: "answer", check, view: await readSession(check) });
}

export function useSessionView() {
  const [flow, send] = useFlow(reduceSession, startSession(), true);
  const live = useRef<Readonly<AbortController> | null>(null);

  const refresh = useCallback(() => {
    const check = new AbortController();

    live.current?.abort();
    live.current = check;
    send({ kind: "check", check });
    void answer(check, send);
  }, [send]);

  useEffect(
    () => () => {
      live.current?.abort();
    },
    [],
  );

  useEffect(refresh, [refresh]);

  const signedIn = useCallback(() => {
    live.current?.abort();
    send({ kind: "signed-in" });
  }, [send]);

  const signedOut = useCallback(() => {
    live.current?.abort();
    send({ kind: "signed-out" });
  }, [send]);

  useSignedOutListener(signedOut);

  return { view: flow.view, refresh, signedIn, signedOut };
}
