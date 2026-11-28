import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";

import { fetchSession } from "./access-api.ts";
import { setUnauthorizedListener } from "./calls.ts";
import type { SignedInDatabase } from "./database-context.ts";
import { enterDatabase } from "./database-storage.ts";
import { UNREACHABLE, type SessionEvent, reduceSession, startSession } from "./session-state.ts";
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
  const askedAt = Date.now();
  const view = await readSession(check);

  if (send({ kind: "answer", check, view }) && view.state === "signed-in") {
    enterDatabase(view.database, askedAt);
  }
}

function begin(
  live: RefObject<Readonly<AbortController> | null>,
  send: (event: SessionEvent) => boolean,
  kind: "check" | "logged-out" | "signed-in",
) {
  const check = new AbortController();

  live.current?.abort();
  live.current = check;
  send({ kind, check });
  void answer(check, send);
}

export function useSessionView() {
  const [flow, send] = useFlow(reduceSession, startSession(), true);
  const live = useRef<Readonly<AbortController> | null>(null);

  const refresh = useCallback(() => {
    begin(live, send, "check");
  }, [send]);

  useEffect(
    () => () => {
      live.current?.abort();
    },
    [],
  );

  useEffect(refresh, [refresh]);

  const signedIn = useCallback(() => {
    begin(live, send, "signed-in");
  }, [send]);

  const unauthorized = useCallback(() => {
    const check = new AbortController();

    if (send({ kind: "unauthorized", check })) {
      live.current = check;
      void answer(check, send);
    }
  }, [send]);

  useUnauthorized(unauthorized);

  const loggedOut = useCallback(() => {
    begin(live, send, "logged-out");
  }, [send]);

  const named = flow.view.state === "signed-in" ? flow.view.database : null;
  const database = useMemo(
    (): SignedInDatabase | null => (named === null ? null : { name: named, recheck: refresh }),
    [named, refresh],
  );

  return { view: flow.view, database, refresh, signedIn, loggedOut };
}

function useUnauthorized(listener: () => void) {
  useEffect(() => {
    setUnauthorizedListener(listener);

    return () => {
      setUnauthorizedListener(null);
    };
  }, [listener]);
}
