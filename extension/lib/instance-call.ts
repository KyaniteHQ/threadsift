import { type Browser, browser } from "wxt/browser";
import { z } from "zod";

import { logFailure } from "./log.ts";
import { type CallFailure, ERROR_EVENT_WAIT_MS, type NamedFailure } from "./state.ts";

type ErrorTable = ReadonlyArray<readonly [RegExp, NamedFailure]>;

const CHROMIUM_ERRORS: ErrorTable = [
  [/^net::ERR_NAME_(?:NOT_RESOLVED|RESOLUTION_FAILED)$/u, "name-not-found"],
  [/^net::ERR_CONNECTION_REFUSED$/u, "connection-refused"],
  [/^net::ERR_(?:CONNECTION_)?TIMED_OUT$/u, "timed-out"],
  [/^net::ERR_(?:CERT_|SSL_)/u, "secure-connection-failed"],
];

const FIREFOX_ERRORS: ErrorTable = [
  [/^NS_ERROR_UNKNOWN_HOST$/u, "name-not-found"],
  [/^NS_ERROR_CONNECTION_REFUSED$/u, "connection-refused"],
  [/^NS_ERROR_NET_TIMEOUT$/u, "timed-out"],
  [/^(?!NS_)\S/u, "secure-connection-failed"],
];

const ErrorTextSchema = z.string().min(1);

function failureOf(error: string | null): CallFailure {
  if (error === null) return "unknown";

  const table = import.meta.env.FIREFOX ? FIREFOX_ERRORS : CHROMIUM_ERRORS;

  return table.find(([pattern]) => pattern.test(error))?.[1] ?? "unknown";
}

export type CallOutcome =
  | { readonly kind: "answered"; readonly response: Response }
  | { readonly kind: "failed"; readonly failure: CallFailure };

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

const NO_WATCH: ErrorWatch = {
  reported: () => Promise.resolve(null),
  stop: () => {},
};

type RequestDetails = Readonly<
  Pick<Browser.webRequest.OnBeforeRequestDetails, "url" | "method" | "tabId" | "requestId">
>;

interface Listeners {
  readonly onStart: (details: RequestDetails) => undefined;
  readonly onError: (details: Readonly<Browser.webRequest.OnErrorOccurredDetails>) => void;
}

type Report = (error: string | null) => void;

function listeners({ url, method }: Readonly<Call>, report: Report): Listeners {
  const started = new Set<string>();

  return {
    onStart: (details) => {
      if (details.url === url.href && details.method === method && details.tabId === -1) {
        started.add(details.requestId);
      }
    },
    onError: ({ requestId, error }) => {
      if (!started.has(requestId)) return;

      const text = ErrorTextSchema.safeParse(error);

      report(started.size === 1 && text.success ? text.data : null);
    },
  };
}

function awaitReport(settled: () => Promise<string | null>, report: Report) {
  return async (): Promise<string | null> => {
    const timer = setTimeout(() => {
      report(null);
    }, ERROR_EVENT_WAIT_MS);
    const error = await settled();

    clearTimeout(timer);

    return error;
  };
}

function watchErrors(call: Readonly<Call>): ErrorWatch {
  if (!("webRequest" in browser)) return NO_WATCH;

  const { onBeforeRequest, onErrorOccurred } = browser.webRequest;
  const { promise, resolve } = Promise.withResolvers<string | null>();
  const { onStart, onError } = listeners(call, resolve);
  const filter = { urls: [call.hostMatch], types: ["xmlhttprequest" as const] };

  const stop = (): void => {
    onBeforeRequest.removeListener(onStart);
    onErrorOccurred.removeListener(onError);
  };

  try {
    onBeforeRequest.addListener(onStart, filter);
    onErrorOccurred.addListener(onError, filter);
  } catch (cause) {
    logFailure("error-watch-failed", cause);
    stop();

    return NO_WATCH;
  }

  return { reported: awaitReport(() => promise, resolve), stop };
}

export async function callInstance(call: Readonly<Call>): Promise<CallOutcome> {
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
    const failure = timedOut ? "timed-out" : failureOf(await watch.reported());

    logFailure(event, new Error(`the call ended without an answer: ${failure}`));

    return { kind: "failed", failure };
  } finally {
    watch.stop();
  }
}
