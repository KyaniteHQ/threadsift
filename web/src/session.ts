import { type MouseEvent, useCallback, useEffect, useState } from "react";

export const SETTINGS_PATH = "/settings";

const SIGNED_OUT = "threadsift:signed-out";

function announceSignedOut(): void {
  window.dispatchEvent(new Event(SIGNED_OUT));
}

type Method = "GET" | "POST" | "DELETE";

export type JsonBody = Readonly<Record<string, string>>;

interface Call {
  readonly json?: JsonBody;
  readonly signsOut?: boolean;
}

const JSON_HEADERS = { "content-type": "application/json" } as const;

export async function call(
  method: Method,
  path: string,
  { json, signsOut = true }: Readonly<Call> = {},
): Promise<Response> {
  const init: RequestInit =
    json === undefined ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(json) };

  const response = await fetch(path, init);

  if (signsOut && response.status === 401) {
    announceSignedOut();
  }

  return response;
}

export function unexpected(method: Method, path: string, status: number): Error {
  return new Error(`${method} ${path} answered ${status}`);
}

export async function callOk(
  method: Method,
  path: string,
  options: Readonly<Call> = {},
): Promise<Response> {
  const response = await call(method, path, options);

  if (!response.ok) {
    throw unexpected(method, path, response.status);
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

export function useInternalLink(open: () => void) {
  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

      if (event.button !== 0 || modified) {
        return;
      }

      event.preventDefault();
      open();
    },
    [open],
  );
}
