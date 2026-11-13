import { connect } from "cloudflare:sockets";

import type { RedditSession } from "../../core/ports.ts";
import {
  REDDIT_HOST,
  boundedBody,
  redditSessionHeaders,
  refusedRequestLine,
} from "../../core/reddit-session.ts";
import { readResponse, requestBytes } from "./http1.ts";

const TLS_PORT = 443;

function failureIgnored(): null {
  return null;
}

async function* closing(
  body: AsyncIterable<Uint8Array>,
  close: () => Promise<void>,
): AsyncGenerator<Uint8Array> {
  try {
    yield* body;
  } finally {
    await close().catch(failureIgnored);
  }
}

export const workerRedditSession: RedditSession = {
  get: async (path, cookie, signal) => {
    if (refusedRequestLine(path, cookie)) throw new TypeError("the request line is not allowed");

    const socket = connect(
      { hostname: REDDIT_HOST, port: TLS_PORT },
      { secureTransport: "on", allowHalfOpen: false },
    );

    const close = () => socket.close();

    signal.addEventListener(
      "abort",
      () => {
        void close().catch(failureIgnored);
      },
      { once: true },
    );

    try {
      signal.throwIfAborted();
      await socket.opened;

      const writer = socket.writable.getWriter();

      await writer.write(requestBytes(REDDIT_HOST, path, redditSessionHeaders(cookie)));
      writer.releaseLock();

      const response = await readResponse(socket.readable);

      return { ...response, body: boundedBody(closing(response.body, close)) };
    } catch (error) {
      await close().catch(failureIgnored);

      throw error;
    }
  },
};
