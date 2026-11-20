import { parentPort } from "node:worker_threads";

import { answerPage } from "../../features/fetch/core/page-answer.ts";
import type { Reply, RequestMessage } from "./page-reader-protocol.ts";

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
    send({ id: request.id, ok: true, value: await answerPage(request) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "the page could not be read";

    send({ id: request.id, ok: false, message });
  }
}

parent.on("message", (message: RequestMessage) => {
  void reply(message);
});
