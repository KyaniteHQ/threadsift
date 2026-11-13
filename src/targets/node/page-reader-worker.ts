import { parentPort } from "node:worker_threads";

import { readArticle, readSuppliedPage, readTitle } from "../../core/article.ts";
import { type Reply, type RequestMessage, RequestMessageSchema } from "./page-reader-protocol.ts";

function answerOf(request: Readonly<RequestMessage>) {
  switch (request.kind) {
    case "title":
      return Promise.resolve(readTitle(request.html));
    case "article":
      return readArticle(request.html, request.url);
    case "page":
      return Promise.resolve(readSuppliedPage(request.page));
    default: {
      const exhaustive: never = request;

      throw new Error(JSON.stringify(exhaustive));
    }
  }
}

if (parentPort === null) {
  throw new Error("the page reader runs only as a worker thread");
}

const parent = parentPort;

function send(answer: Readonly<Reply>): void {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads ports have no target origin
  parent.postMessage(answer);
}

async function reply(request: Readonly<RequestMessage>): Promise<void> {
  try {
    send({ id: request.id, ok: true, value: await answerOf(request) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "the page could not be read";

    send({ id: request.id, ok: false, message });
  }
}

parent.on("message", (message) => {
  void reply(RequestMessageSchema.parse(message));
});
