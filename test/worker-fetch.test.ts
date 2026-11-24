import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Hono } from "hono";

import { workerFetch } from "../src/targets/worker/network.ts";
import { type Listening, listening } from "./loopback-server.ts";

const PAGE_TEXT = "error code: 1016";

const QUOTING_BODY = `${PAGE_TEXT} was reported by the upstream service`;

const TEXT = new TextEncoder();

const HEAD_CHUNKS = {
  "one-chunk": ["a".repeat(64)],
  "two-chunks": ["b".repeat(40), "c".repeat(40)],
} as const;

const TAIL = "tail of the body";

describe("the Worker's fetch returns an origin's answer as it was sent and follows no redirect", () => {
  let server: Listening;

  const finishers = new Map<string, () => void>();

  before(async () => {
    const app = new Hono();

    for (const [name, chunks] of Object.entries(HEAD_CHUNKS)) {
      app.get(`/open-530/${name}`, () => {
        const body = new ReadableStream<Uint8Array>({
          start: (controller) => {
            for (const chunk of chunks) controller.enqueue(TEXT.encode(chunk));
            finishers.set(name, () => {
              controller.enqueue(TEXT.encode(TAIL));
              controller.close();
            });
          },
        });

        return new Response(body, { status: 530 });
      });
    }

    app.get("/own-530", () => new Response(QUOTING_BODY, { status: 530 }));
    app.get("/unavailable", (context) => context.text(PAGE_TEXT, 503));
    app.get("/ok-with-page-text", (context) => context.text(PAGE_TEXT, 200));
    app.get("/moved", (context) => context.redirect("/ok-with-page-text", 302));
    server = await listening(app.fetch);
  });

  after(() => {
    server.stop();
  });

  it("returns a 530 whose body only quotes an error code, with its status and its whole body", async () => {
    const answer = await workerFetch(`${server.url}/own-530`);

    assert.equal(answer.status, 530);
    assert.equal(await answer.text(), QUOTING_BODY);
  });

  it(
    "returns a 530 at once when its body holds 64 bytes or more and stays open, and the body is still readable",
    { timeout: 5000 },
    async () => {
      await Promise.all(
        Object.entries(HEAD_CHUNKS).map(async ([name, chunks]) => {
          const answer = await workerFetch(`${server.url}/open-530/${name}`);

          assert.equal(answer.status, 530);
          finishers.get(name)?.();
          assert.equal(await answer.text(), chunks.join("") + TAIL);
        }),
      );
    },
  );

  it("returns an answer with another status even when its whole body is an error code", async () => {
    const unavailable = await workerFetch(`${server.url}/unavailable`);
    const ok = await workerFetch(`${server.url}/ok-with-page-text`);

    assert.deepEqual([unavailable.status, ok.status], [503, 200]);
    assert.deepEqual([await unavailable.text(), await ok.text()], [PAGE_TEXT, PAGE_TEXT]);
  });

  it("returns a redirect answer without following it", async () => {
    const answer = await workerFetch(`${server.url}/moved`);

    assert.equal(answer.status, 302);
    assert.equal(answer.headers.get("location"), "/ok-with-page-text");
  });
});
