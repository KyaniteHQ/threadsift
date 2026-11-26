import type { Server } from "node:http";

import { serve } from "@hono/node-server";

import { NO_INDEX_HEADERS } from "../../http/web-headers.ts";

const KEEP_ALIVE_TIMEOUT_MS = 65_000;

type FetchCallback = Parameters<typeof serve>[0]["fetch"];

export function serveContainer(fetch: FetchCallback, port: number): Server {
  const server = serve({ fetch, port, serverOptions: { keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS } });

  if (!("closeAllConnections" in server)) {
    throw new Error("The container requires an HTTP/1 server");
  }

  server.prependListener("request", (_request, response) => {
    for (const [name, value] of Object.entries(NO_INDEX_HEADERS)) response.setHeader(name, value);

    response.once("finish", () => {
      if (!server.listening) server.closeIdleConnections();
    });
  });

  return server;
}
