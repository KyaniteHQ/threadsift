import { type Socket, connect, createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

const UPLOAD_CHUNK_BYTES = 256 * 1024;
const UPLOAD_CHUNK_MS = 25;

export type Upload = "buffered" | "paced";

export interface SlowLink {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

const Listening = z.object({ port: z.number() });

type Finished = () => Promise<void>;

function joinSockets(client: Socket, upstream: Socket): AbortSignal {
  const closed = new AbortController();

  function close(): void {
    closed.abort();
    client.destroy();
    upstream.destroy();
  }

  upstream.on("data", (data: Buffer) => {
    client.write(data);
  });
  client.on("close", close);
  upstream.on("close", close);
  client.on("error", close);
  upstream.on("error", close);

  return closed.signal;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return sleep(ms, undefined, { signal }).catch(() => {});
}

function bufferedUpload(client: Socket, upstream: Socket, closed: AbortSignal): Finished {
  const queue: Buffer[] = [];
  let draining = Promise.resolve();
  let running = false;

  async function drain(): Promise<void> {
    running = true;

    for (let chunk = queue.shift(); chunk !== undefined && !closed.aborted; chunk = queue.shift()) {
      upstream.write(chunk);
      await pause(UPLOAD_CHUNK_MS, closed);
    }

    queue.length = 0;
    running = false;
  }

  client.on("data", (data: Buffer) => {
    for (let offset = 0; offset < data.length; offset += UPLOAD_CHUNK_BYTES) {
      queue.push(data.subarray(offset, offset + UPLOAD_CHUNK_BYTES));
    }

    if (!running) {
      draining = drain();
    }
  });

  return () => draining;
}

function pacedUpload(client: Socket, upstream: Socket, closed: AbortSignal): Finished {
  let pacing = Promise.resolve();

  async function pace(data: Buffer): Promise<void> {
    client.pause();
    upstream.write(data);
    await pause((data.length * UPLOAD_CHUNK_MS) / UPLOAD_CHUNK_BYTES, closed);

    if (!closed.aborted) {
      client.resume();
    }
  }

  client.on("data", (data: Buffer) => {
    pacing = pace(data);
  });

  return () => pacing;
}

export function slowLink(target: string, upload: Upload): Promise<SlowLink> {
  const { hostname, port } = new URL(target);
  const sockets = new Set<Socket>();
  const finishers: Finished[] = [];

  const server = createServer((client) => {
    const upstream = connect(Number(port), hostname);

    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("close", () => {
        sockets.delete(socket);
      });
    }

    const closed = joinSockets(client, upstream);

    finishers.push(
      upload === "buffered"
        ? bufferedUpload(client, upstream, closed)
        : pacedUpload(client, upstream, closed),
    );
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
          await Promise.all(finishers.map((finished) => finished()));
        },
      });
    });
  });
}
