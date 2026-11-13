import { useEffect } from "react";

const UNAUTHORIZED = "threadsift:unauthorized";

export function announceUnauthorized(): void {
  window.dispatchEvent(new Event(UNAUTHORIZED));
}

export function useUnauthorizedListener(onUnauthorized: () => void): void {
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED, onUnauthorized);

    return () => {
      window.removeEventListener(UNAUTHORIZED, onUnauthorized);
    };
  }, [onUnauthorized]);
}
