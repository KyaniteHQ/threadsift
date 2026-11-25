import { THREAD_CONTENT_BYTES } from "../../../core/contract/limits.ts";
import { REDDIT_SESSION_COOKIE } from "../../../core/contract/reddit-account-contract.ts";
import { OK, type RedditAnswer } from "../../../core/contract/reddit-http.ts";
import { readCapped } from "../../../core/kernel/capped.ts";
import { reportFailure } from "../../../core/kernel/failure-log.ts";
import {
  type NetworkResponse,
  REQUEST_HEADERS,
  type RequestHeaders,
  networkResponseOf,
  wireResponseOf,
} from "../../../core/kernel/network.ts";

const REDDIT_HOST = "www.reddit.com";

function redditSessionHeaders(cookie: string): RequestHeaders {
  return {
    ...REQUEST_HEADERS,
    accept: "application/json",
    cookie: `${REDDIT_SESSION_COOKIE}=${cookie}`,
  };
}

async function* boundedBody(body: Readonly<AsyncIterable<Uint8Array>>): AsyncGenerator<Uint8Array> {
  let size = 0;

  for await (const chunk of body) {
    size += chunk.length;

    if (size > THREAD_CONTENT_BYTES) throw new RangeError("the answer is longer than the limit");

    yield chunk;
  }
}

export async function redditSessionGet(
  path: string,
  cookie: string,
  signal: AbortSignal,
): Promise<NetworkResponse> {
  if (!path.startsWith("/")) throw new TypeError("the path does not start with /");

  const wire = wireResponseOf(
    await fetch(`https://${REDDIT_HOST}${path}`, {
      headers: redditSessionHeaders(cookie),
      redirect: "manual",
      signal,
    }),
  );

  return networkResponseOf({ ...wire, body: boundedBody(wire.body) });
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
  } catch (cause) {
    reportFailure({ event: "reddit-answer-unread", fields: { status } }, cause);

    return { status: 0, text: "", remaining, reset, retryAfter };
  }
}
