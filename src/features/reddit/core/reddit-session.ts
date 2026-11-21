import { THREAD_CONTENT_BYTES } from "../../../core/contract/limits.ts";
import { REDDIT_SESSION_COOKIE } from "../../../core/contract/reddit-account-contract.ts";
import { OK, type RedditAnswer } from "../../../core/contract/reddit-http.ts";
import { readCapped } from "../../../core/kernel/capped.ts";
import {
  NO_COMPRESSION,
  type NetworkResponse,
  REQUEST_HEADERS,
  type RedditSession,
  type RequestHeaders,
  type WireResponse,
  networkResponseOf,
} from "../../../core/kernel/network.ts";

const REDDIT_HOST = "www.reddit.com";

const HEADER_BREAK = /[\r\n]/u;

interface RedditRequest {
  readonly host: string;
  readonly path: string;
  readonly headers: RequestHeaders;
}

function redditSessionHeaders(cookie: string): RequestHeaders {
  return {
    ...REQUEST_HEADERS,
    accept: "application/json",
    ...NO_COMPRESSION,
    cookie: `${REDDIT_SESSION_COOKIE}=${cookie}`,
  };
}

function refusedRequestLine(path: string, cookie: string): boolean {
  return !path.startsWith("/") || HEADER_BREAK.test(path) || HEADER_BREAK.test(cookie);
}

async function* boundedBody(body: Readonly<AsyncIterable<Uint8Array>>): AsyncGenerator<Uint8Array> {
  let size = 0;

  for await (const chunk of body) {
    size += chunk.length;

    if (size > THREAD_CONTENT_BYTES) throw new RangeError("the answer is longer than the limit");

    yield chunk;
  }
}

export function redditSessionOver(
  send: (request: Readonly<RedditRequest>, signal: AbortSignal) => Promise<WireResponse>,
): RedditSession {
  return {
    get: async (path, cookie, signal) => {
      if (refusedRequestLine(path, cookie)) throw new TypeError("the request line is not allowed");

      const wire = await send(
        { host: REDDIT_HOST, path, headers: redditSessionHeaders(cookie) },
        signal,
      );

      return networkResponseOf({ ...wire, body: boundedBody(wire.body) });
    },
  };
}

export async function answerOf(response: NetworkResponse): Promise<RedditAnswer> {
  const { remaining, reset, retryAfter } = response.rateLimit;
  const { status } = response;
  const answered = status === OK;

  try {
    const { bytes, cut } = await readCapped(response.body, answered ? THREAD_CONTENT_BYTES : 0);

    return answered && !cut
      ? { status, text: new TextDecoder().decode(bytes), remaining, reset, retryAfter }
      : { status: answered ? 0 : status, text: "", remaining, reset, retryAfter };
  } catch {
    return { status: 0, text: "", remaining, reset, retryAfter };
  }
}
