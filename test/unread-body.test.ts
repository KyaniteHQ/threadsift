import assert from "node:assert/strict";
import { once } from "node:events";
import {
  Agent,
  type ClientRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  request,
} from "node:http";
import type { Socket } from "node:net";
import { after, before, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import type { HttpBindings } from "@hono/node-server";
import { Hono } from "hono";

import { answerAfterBody } from "../src/targets/node/unread-body.ts";
import { type Listening, listening } from "./loopback-server.ts";

const DISCARD_LIMIT_BYTES = 64 * 1024 * 1024;

const PAUSE_PAST_HONO_CLEANUP_MS = 700;

const MEBIBYTE = 1024 * 1024;

interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly socket: Socket | null;
}

async function writeParts(
  outgoing: ClientRequest,
  parts: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<void> {
  for await (const part of parts) {
    if (!outgoing.write(part)) await once(outgoing, "drain");
  }

  outgoing.end();
}

function upload({
  agent,
  url,
  length,
  parts,
}: Readonly<{
  agent: Agent;
  url: string;
  length: number;
  parts: Iterable<Uint8Array> | AsyncIterable<Uint8Array>;
}>): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, {
      agent,
      method: "POST",
      headers: { "content-length": String(length) },
    });
    let sent = false;
    let answer: Answer | null = null;

    const settle = () => {
      if (sent && answer !== null) resolve(answer);
    };

    outgoing.on("error", reject);
    outgoing.on("close", () => {
      reject(new Error("the connection closed before the body was sent and the answer read"));
    });
    outgoing.on("finish", () => {
      sent = true;
      settle();
    });
    outgoing.on("response", (incoming) => {
      incoming.resume();
      incoming.on("end", () => {
        answer = {
          status: incoming.statusCode ?? 0,
          headers: incoming.headers,
          socket: outgoing.socket,
        };
        settle();
      });
    });
    writeParts(outgoing, parts).catch(reject);
  });
}

async function* slowBody(): AsyncGenerator<Uint8Array> {
  yield new Uint8Array(1000);
  await sleep(PAUSE_PAST_HONO_CLEANUP_MS);
  yield new Uint8Array(1000);
}

function bodyBytesRead({ method, url, httpVersion, rawHeaders, socket }: IncomingMessage): number {
  const fields = Array.from(
    { length: rawHeaders.length / 2 },
    (_, at) => `${rawHeaders[2 * at] ?? ""}: ${rawHeaders[2 * at + 1] ?? ""}`,
  );
  const head = [`${method ?? ""} ${url ?? ""} HTTP/${httpVersion}`, ...fields].join("\r\n");

  return socket.bytesRead - Buffer.byteLength(`${head}\r\n\r\n`);
}

function* bodyOf(length: number): Generator<Uint8Array> {
  const chunk = new Uint8Array(MEBIBYTE);

  for (let sent = 0; sent < length; sent += chunk.length) {
    yield chunk.subarray(0, Math.min(chunk.length, length - sent));
  }
}

describe("the container answers a request without reading its body, then discards the body", () => {
  let server: Listening;
  let agent: Agent;
  let bodyBytesReadAtAnswer = 0;

  before(async () => {
    const app = new Hono<{ Bindings: HttpBindings }>();

    app.use("*", async (context, next) => {
      await next();
      bodyBytesReadAtAnswer = bodyBytesRead(context.env.incoming);
    });
    app.use("*", answerAfterBody);
    app.post("/refused", (context) => context.text("no", 401));
    app.post("/too-large", (context) => context.text("too large", 413));
    server = await listening(app.fetch);
    agent = new Agent({ keepAlive: true, maxSockets: 1 });
  });

  after(async () => {
    agent.destroy();
    await server.stop();
  });

  it("keeps the connection usable for the next request when the client sends the body more slowly than the server library waits for an unread one", async () => {
    const first = await upload({
      agent,
      url: `${server.url}/refused`,
      length: 2000,
      parts: slowBody(),
    });
    const second = await upload({
      agent,
      url: `${server.url}/refused`,
      length: 2000,
      parts: [new Uint8Array(2000)].values(),
    });

    assert.deepEqual([first.status, second.status], [401, 401]);
    assert.notEqual(first.headers["connection"], "close");
    assert.equal(second.socket, first.socket);
  });

  it("keeps the connection usable after a body of exactly 64 MiB", async () => {
    const first = await upload({
      agent,
      url: `${server.url}/too-large`,
      length: DISCARD_LIMIT_BYTES,
      parts: bodyOf(DISCARD_LIMIT_BYTES),
    });
    const second = await upload({
      agent,
      url: `${server.url}/refused`,
      length: 1,
      parts: [new Uint8Array(1)].values(),
    });

    assert.deepEqual([first.status, second.status], [413, 401]);
    assert.notEqual(first.headers["connection"], "close");
    assert.equal(second.socket, first.socket);
  });

  it("ends the answer to a body of 64 MiB plus one byte with Connection: close, after the server read all of it", async () => {
    const fresh = new Agent({ keepAlive: true, maxSockets: 1 });

    try {
      const answer = await upload({
        agent: fresh,
        url: `${server.url}/too-large`,
        length: DISCARD_LIMIT_BYTES + 1,
        parts: bodyOf(DISCARD_LIMIT_BYTES + 1),
      });

      assert.equal(answer.status, 413);
      assert.equal(answer.headers["connection"], "close");
      assert.ok(
        bodyBytesReadAtAnswer >= DISCARD_LIMIT_BYTES + 1,
        `${String(bodyBytesReadAtAnswer)} body bytes`,
      );
    } finally {
      fresh.destroy();
    }
  });
});
