import { connect } from "cloudflare:sockets";

import { bestEffort } from "../../core/kernel/failure-log.ts";
import type { RedditSession } from "../../core/kernel/network.ts";
import { redditSessionOver } from "../../core/reddit/reddit-session.ts";
import { readResponse, requestBytes } from "./http1.ts";

const TLS_PORT = 443;

const SOCKET_NOT_CLOSED = { event: "reddit-socket-not-closed", fields: {} } as const;

async function* closing(
  body: AsyncIterable<Uint8Array>,
  close: () => Promise<void>,
): AsyncGenerator<Uint8Array> {
  try {
    yield* body;
  } finally {
    await bestEffort(SOCKET_NOT_CLOSED, close);
  }
}

export const workerRedditSession: RedditSession = redditSessionOver(
  async ({ host, path, headers }, signal) => {
    const socket = connect(
      { hostname: host, port: TLS_PORT },
      { secureTransport: "on", allowHalfOpen: false },
    );

    const close = () => socket.close();

    signal.addEventListener(
      "abort",
      () => {
        void bestEffort(SOCKET_NOT_CLOSED, close);
      },
      { once: true },
    );

    try {
      signal.throwIfAborted();
      await socket.opened;

      const writer = socket.writable.getWriter();

      await writer.write(requestBytes(host, path, headers));
      writer.releaseLock();

      const response = await readResponse(socket.readable);

      return { ...response, body: closing(response.body, close) };
    } catch (error) {
      await bestEffort(SOCKET_NOT_CLOSED, close);

      throw error;
    }
  },
);
