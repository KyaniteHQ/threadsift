import { useEffect } from "react";

const SIGNED_OUT = "threadsift:signed-out";

export function announceSignedOut(): void {
  window.dispatchEvent(new Event(SIGNED_OUT));
}

export function useSignedOutListener(onSignedOut: () => void): void {
  useEffect(() => {
    window.addEventListener(SIGNED_OUT, onSignedOut);

    return () => {
      window.removeEventListener(SIGNED_OUT, onSignedOut);
    };
  }, [onSignedOut]);
}
