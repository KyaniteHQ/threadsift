import { useCallback, useEffect, useState } from "react";

const SIGNED_OUT = "threadsift:signed-out";

export function announceSignedOut(): void {
  window.dispatchEvent(new Event(SIGNED_OUT));
}

export async function ownerFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, init);

  if (response.status === 401) {
    announceSignedOut();
  }

  return response;
}

export async function ownerGetOk(path: string): Promise<Response> {
  const response = await ownerFetch(path);

  if (!response.ok) {
    throw new Error(`GET ${path} answered ${response.status}`);
  }

  return response;
}

export function useSignedOutListener(onSignedOut: () => void): void {
  useEffect(() => {
    window.addEventListener(SIGNED_OUT, onSignedOut);

    return () => {
      window.removeEventListener(SIGNED_OUT, onSignedOut);
    };
  }, [onSignedOut]);
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const update = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener("popstate", update);

    return () => {
      window.removeEventListener("popstate", update);
    };
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, "", to);
    setPath(to);
  }, []);

  return { path, navigate };
}
