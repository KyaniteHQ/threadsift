import { serve } from "@hono/node-server";

export interface Listening {
  readonly url: string;
  readonly stop: () => void;
}

export function listening(fetch: (request: Request) => Promise<Response>): Promise<Listening> {
  return new Promise((resolve) => {
    const server = serve({ fetch, port: 0, hostname: "127.0.0.1" }, ({ port }) => {
      resolve({
        url: `http://127.0.0.1:${String(port)}`,
        stop: () => {
          server.close();
        },
      });
    });
  });
}
