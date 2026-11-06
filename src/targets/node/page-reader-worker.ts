import { parentPort } from "node:worker_threads";

import { z } from "zod";

import { readArticle, readTitle } from "../../core/article.ts";

const RequestSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.number(), kind: z.literal("title"), html: z.string() }),
  z.object({ id: z.number(), kind: z.literal("article"), html: z.string(), url: z.string() }),
]);

type Request = z.infer<typeof RequestSchema>;

function answerOf(request: Readonly<Request>) {
  return request.kind === "title"
    ? Promise.resolve(readTitle(request.html))
    : readArticle(request.html, request.url);
}

if (parentPort === null) {
  throw new Error("the page reader runs only as a worker thread");
}

const parent = parentPort;

async function reply(request: Readonly<Request>): Promise<void> {
  try {
    const value = await answerOf(request);
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads ports have no target origin
    parent.postMessage({ id: request.id, ok: true, value });
  } catch (error) {
    const message = error instanceof Error ? error.message : "the page could not be read";
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads ports have no target origin
    parent.postMessage({ id: request.id, ok: false, message });
  }
}

parent.on("message", (message) => {
  void reply(RequestSchema.parse(message));
});
