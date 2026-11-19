import { readCapped } from "./capped.ts";
import { THREAD_CONTENT_BYTES } from "./limits.ts";
import { type NetworkResponse, REQUEST_HEADERS, type RequestHeaders } from "./network.ts";
import { OK, type RedditAnswer } from "./reddit-http.ts";

export const REDDIT_HOST = "www.reddit.com";

const HEADER_BREAK = /[\r\n]/u;

export function redditSessionHeaders(cookie: string): RequestHeaders {
  return {
    ...REQUEST_HEADERS,
    accept: "application/json",
    "accept-encoding": "identity",
    cookie: `reddit_session=${cookie}`,
  };
}

export function refusedRequestLine(path: string, cookie: string): boolean {
  return !path.startsWith("/") || HEADER_BREAK.test(path) || HEADER_BREAK.test(cookie);
}

export async function* boundedBody(
  body: Readonly<AsyncIterable<Uint8Array> | Iterable<Uint8Array>>,
  maxBytes: number = THREAD_CONTENT_BYTES,
): AsyncGenerator<Uint8Array> {
  let size = 0;

  for await (const chunk of body) {
    size += chunk.length;

    if (size > maxBytes) throw new RangeError("the answer is longer than the limit");

    yield chunk;
  }
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
