import { useCallback, useEffect, useState } from "react";

import { type SessionState, fetchSessionState } from "./access-api.ts";
import { useSignedOutListener } from "./session.ts";

export type View = SessionState | "loading" | "unreachable";

export function useSessionView() {
  const [view, setView] = useState<View>("loading");

  const refresh = useCallback(() => {
    fetchSessionState().then(setView, () => {
      setView("unreachable");
    });
  }, []);

  useEffect(refresh, [refresh]);

  const signedOut = useCallback(() => {
    setView("signed-out");
  }, []);

  useSignedOutListener(signedOut);

  return { view, refresh };
}
