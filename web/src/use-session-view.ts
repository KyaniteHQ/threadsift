import { useCallback, useEffect, useRef } from "react";

import { type Session, fetchSession } from "./access-api.ts";
import { useSignedOutListener } from "./signed-out.ts";
import { useScreenState } from "./use-screen-state.ts";

export type View = Session | { readonly state: "loading" } | { readonly state: "unreachable" };

const LOADING: View = { state: "loading" };
const UNREACHABLE: View = { state: "unreachable" };
const SIGNED_IN: View = { state: "signed-in" };
const SIGNED_OUT: View = { state: "signed-out" };

const CHECK_DEADLINE_MS = 10_000;

async function readSession(
  check: Readonly<AbortController>,
  accept: (view: View) => void,
): Promise<void> {
  try {
    accept(
      await fetchSession(AbortSignal.any([check.signal, AbortSignal.timeout(CHECK_DEADLINE_MS)])),
    );
  } catch {
    accept(UNREACHABLE);
  }
}

export function useSessionView() {
  const [view, setView] = useScreenState<View>(LOADING);
  const latest = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    latest.current?.abort();

    const check = new AbortController();
    latest.current = check;

    void readSession(check, (next) => {
      if (latest.current === check) setView(next);
    });
  }, [setView]);

  useEffect(refresh, [refresh]);

  const signedIn = useCallback(() => {
    setView(SIGNED_IN);
  }, [setView]);

  const signedOut = useCallback(() => {
    setView(SIGNED_OUT);
  }, [setView]);

  useSignedOutListener(signedOut);

  return { view, refresh, signedIn, signedOut };
}
