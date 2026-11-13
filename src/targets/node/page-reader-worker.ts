import { parentPort } from "node:worker_threads";

import { z } from "zod";

import { readArticle, readSuppliedPage, readTitle } from "../../core/article.ts";
import { SuppliedPageSchema } from "../../core/supplied-page.ts";

const RequestSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.number(), kind: z.literal("title"), html: z.string() }),
  z.object({ id: z.number(), kind: z.literal("article"), html: z.string(), url: z.string() }),
  z.object({ id: z.number(), kind: z.literal("page"), page: SuppliedPageSchema }),
]);

type Request = z.infer<typeof RequestSchema>;

function answerOf(request: Readonly<Request>) {
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

type Answer =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly message: string };

function send(answer: Readonly<Answer>): void {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads ports have no target origin
  parent.postMessage(answer);
}

async function reply(request: Readonly<Request>): Promise<void> {
  try {
    send({ id: request.id, ok: true, value: await answerOf(request) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "the page could not be read";

    send({ id: request.id, ok: false, message });
  }
}

parent.on("message", (message) => {
  void reply(RequestSchema.parse(message));
});
