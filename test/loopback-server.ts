import { serve } from "@hono/node-server";

export interface Listening {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

export function listening(fetch: Parameters<typeof serve>[0]["fetch"]): Promise<Listening> {
  return new Promise((resolve) => {
    const server = serve({ fetch, port: 0, hostname: "127.0.0.1" }, ({ port }) => {
      resolve({
        url: `http://127.0.0.1:${String(port)}`,
        stop: () =>
          new Promise((done) => {
            server.close(() => {
              done();
            });
            if ("closeAllConnections" in server) server.closeAllConnections();
          }),
      });
    });
  });
}
