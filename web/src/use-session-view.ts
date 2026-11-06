import { useCallback, useEffect, useState } from "react";

import { type Session, fetchSession } from "./access-api.ts";
import { useSignedOutListener } from "./signed-out.ts";

export type View = Session | { readonly state: "loading" } | { readonly state: "unreachable" };

const LOADING: View = { state: "loading" };
const UNREACHABLE: View = { state: "unreachable" };
const SIGNED_IN: View = { state: "signed-in" };
const SIGNED_OUT: View = { state: "signed-out" };

export function useSessionView() {
  const [view, setView] = useState<View>(LOADING);

  const refresh = useCallback(() => {
    fetchSession().then(setView, () => {
      setView(UNREACHABLE);
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
