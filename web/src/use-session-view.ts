import { useCallback, useEffect, useState } from "react";

import { type SessionSnapshot, type SessionState, fetchSessionState } from "./access-api.ts";
import { useSignedOutListener } from "./session.ts";

export type View = SessionState | "loading" | "unreachable";

export function useSessionView() {
  const [view, setView] = useState<View>("loading");
  const [unavailable, setUnavailable] = useState<SessionSnapshot["unavailable"]>(null);

  const apply = useCallback((snapshot: SessionSnapshot) => {
    setUnavailable(snapshot.unavailable);
    setView(snapshot.state);
  }, []);

  const refresh = useCallback(() => {
    fetchSessionState().then(apply, () => {
      setView("unreachable");
    });
  }, [apply]);

  useEffect(refresh, [refresh]);

  const signedOut = useCallback(() => {
    setView("signed-out");
  }, []);

  useSignedOutListener(signedOut);

  return { view, unavailable, refresh };
}
