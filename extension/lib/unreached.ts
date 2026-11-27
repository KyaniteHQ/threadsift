import { type Browser, browser } from "wxt/browser";

import { logFailure } from "./log.ts";

export const UNREACHED = [
  "name-not-found",
  "connection-refused",
  "timed-out",
  "certificate-refused",
  "unreachable",
] as const;

export type Unreached = (typeof UNREACHED)[number];

export const ERROR_EVENT_WAIT_MS = 1_000;

const BROWSER_ERRORS: ReadonlyArray<readonly [RegExp, Unreached]> = [
  [/^net::ERR_NAME_(?:NOT_RESOLVED|RESOLUTION_FAILED)$|^NS_ERROR_UNKNOWN_HOST$/u, "name-not-found"],
  [/^net::ERR_CONNECTION_REFUSED$|^NS_ERROR_CONNECTION_REFUSED$/u, "connection-refused"],
  [/^net::ERR_(?:CONNECTION_)?TIMED_OUT$|^NS_ERROR_NET_TIMEOUT$/u, "timed-out"],
  [/^net::ERR_CERT_/u, "certificate-refused"],
  [/^(?!net::|NS_)/u, "certificate-refused"],
];

function causeOfError(error: string | null): Unreached {
  if (error === null) return "unreachable";

  return BROWSER_ERRORS.find(([pattern]) => pattern.test(error))?.[1] ?? "unreachable";
}

export type Reached =
  | { readonly kind: "answered"; readonly response: Response }
  | { readonly kind: "unreached"; readonly cause: Unreached };

export interface Call {
  readonly url: URL;
  readonly hostMatch: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
  readonly redirect: "error" | "manual";
  readonly deadlineMs: number;
  readonly event: string;
}

interface ErrorWatch {
  readonly reported: () => Promise<string | null>;
  readonly stop: () => void;
}

type ErrorDetails = Browser.webRequest.OnErrorOccurredDetails;

const NO_WATCH: ErrorWatch = {
  reported: () => Promise.resolve(null),
  stop: () => {},
};

function watchErrors({ url, hostMatch, method }: Readonly<Call>): ErrorWatch {
  const events = "webRequest" in browser ? browser.webRequest.onErrorOccurred : undefined;

  if (events === undefined) return NO_WATCH;

  let seen: string | null = null;
  let report: ((error: string) => void) | null = null;

  const listener = (details: Readonly<ErrorDetails>): void => {
    if (details.url !== url.href || details.method !== method) return;

    seen = details.error;
    report?.(details.error);
  };

  events.addListener(listener, { urls: [hostMatch], types: ["xmlhttprequest"] });

  return {
    reported: () =>
      new Promise((resolve) => {
        if (seen !== null) {
          resolve(seen);

          return;
        }

        const timer = setTimeout(() => {
          resolve(null);
        }, ERROR_EVENT_WAIT_MS);

        report = (error) => {
          clearTimeout(timer);
          resolve(error);
        };
      }),
    stop: () => {
      events.removeListener(listener);
    },
  };
}

export async function reach(call: Readonly<Call>): Promise<Reached> {
  const watch = watchErrors(call);
  const { url, method, headers, body, redirect, deadlineMs, event } = call;

  try {
    const response = await fetch(url, {
      method,
      headers: { ...headers },
      body,
      redirect,
      signal: AbortSignal.timeout(deadlineMs),
    });

    return { kind: "answered", response };
  } catch (thrown) {
    const timedOut = thrown instanceof DOMException && thrown.name === "TimeoutError";
    const cause = timedOut ? "timed-out" : causeOfError(await watch.reported());

    logFailure(event, new Error(`the call ended without an answer: ${cause}`));

    return { kind: "unreached", cause };
  } finally {
    watch.stop();
  }
}
