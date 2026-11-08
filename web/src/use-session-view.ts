import { useCallback, useEffect, useRef, useState } from "react";

import { type Session, fetchSession } from "./access-api.ts";
import { useSignedOutListener } from "./signed-out.ts";

export type View = Session | { readonly state: "loading" } | { readonly state: "unreachable" };

const LOADING: View = { state: "loading" };
const UNREACHABLE: View = { state: "unreachable" };
const SIGNED_IN: View = { state: "signed-in" };
const SIGNED_OUT: View = { state: "signed-out" };

const CHECK_DEADLINE_MS = 10_000;

async function readSession(
  check: Readonly<AbortController>,
  deadline: number,
  accept: (view: View) => void,
): Promise<void> {
  try {
    accept(await fetchSession(check.signal));
  } catch {
    accept(UNREACHABLE);
  } finally {
    window.clearTimeout(deadline);
  }
}

export function useSessionView() {
  const [view, setView] = useState<View>(LOADING);
  const latest = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    latest.current?.abort();

    const check = new AbortController();
    latest.current = check;

    const deadline = window.setTimeout(() => {
      check.abort();
    }, CHECK_DEADLINE_MS);

    void readSession(check, deadline, (next) => {
      if (latest.current === check) setView(next);
    });
  }, []);

  useEffect(refresh, [refresh]);

  const signedIn = useCallback(() => {
    setView(SIGNED_IN);
  }, []);

  const signedOut = useCallback(() => {
    setView(SIGNED_OUT);
  }, []);

  useSignedOutListener(signedOut);

  return { view, refresh, signedIn, signedOut };
}
