import { type Socket, connect, createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

const UPLOAD_CHUNK_BYTES = 256 * 1024;
const UPLOAD_CHUNK_MS = 25;

export interface SlowLink {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

const Listening = z.object({ port: z.number() });

function relay(client: Socket, upstream: Socket): () => Promise<void> {
  const queue: Buffer[] = [];
  const closed = new AbortController();
  let draining = Promise.resolve();
  let running = false;

  async function drain(): Promise<void> {
    running = true;

    for (
      let chunk = queue.shift();
      chunk !== undefined && !closed.signal.aborted;
      chunk = queue.shift()
    ) {
      upstream.write(chunk);
      await sleep(UPLOAD_CHUNK_MS, undefined, { signal: closed.signal }).catch(() => {});
    }

    running = false;
  }

  function close(): void {
    closed.abort();
    queue.length = 0;
    client.destroy();
    upstream.destroy();
  }

  client.on("data", (data: Buffer) => {
    for (let offset = 0; offset < data.length; offset += UPLOAD_CHUNK_BYTES) {
      queue.push(data.subarray(offset, offset + UPLOAD_CHUNK_BYTES));
    }

    if (!running) {
      draining = drain();
    }
  });

  upstream.on("data", (data: Buffer) => {
    client.write(data);
  });
  client.on("close", close);
  upstream.on("close", close);
  client.on("error", close);
  upstream.on("error", close);

  return () => draining;
}

export function slowLink(target: string): Promise<SlowLink> {
  const { hostname, port } = new URL(target);
  const sockets = new Set<Socket>();
  const drains: (() => Promise<void>)[] = [];

  const server = createServer((client) => {
    const upstream = connect(Number(port), hostname);

    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("close", () => {
        sockets.delete(socket);
      });
    }

    drains.push(relay(client, upstream));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${Listening.parse(server.address()).port}`,
        stop: async () => {
          const closing = new Promise<void>((done) => {
            server.close(() => {
              done();
            });
          });

          for (const socket of sockets) {
            socket.destroy();
          }

          await closing;
          await Promise.all(drains.map((finished) => finished()));
        },
      });
    });
  });
}
