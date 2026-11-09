import { Worker } from "node:worker_threads";

import { z } from "zod";

import { type ArticleReading, ArticleReadingSchema } from "../../core/article.ts";
import { PageReadTimeout } from "../../core/page-read-timeout.ts";
import type { PageReader } from "../../core/ports.ts";
import type { SuppliedPage } from "../../core/supplied-page.ts";

const WORKER_FILE = new URL("./page-reader-worker.ts", import.meta.url);

const ReplySchema = z.discriminatedUnion("ok", [
  z.object({
    id: z.number(),
    ok: z.literal(true),
    value: z.union([z.string(), ArticleReadingSchema]),
  }),
  z.object({ id: z.number(), ok: z.literal(false), message: z.string() }),
]);

type Answered = string | Readonly<ArticleReading>;

type Request =
  | { readonly kind: "title"; readonly html: string }
  | { readonly kind: "article"; readonly html: string; readonly url: string }
  | { readonly kind: "page"; readonly page: SuppliedPage };

interface Pending {
  readonly succeed: (value: Answered) => void;
  readonly fail: (error: Readonly<Error>) => void;
}

const MAX_HTML_BYTES = 5 * 1024 * 1024;

export class WorkerPageReader implements PageReader {
  readonly maxHtmlBytes = MAX_HTML_BYTES;
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();

  readonly title = (html: string, deadline: AbortSignal): Promise<string> =>
    this.ask({ kind: "title", html }, deadline, (value) => z.string().parse(value));

  readonly article = (html: string, url: string, deadline: AbortSignal) =>
    this.ask({ kind: "article", html, url }, deadline, (value) =>
      ArticleReadingSchema.parse(value),
    );

  readonly page = (page: SuppliedPage, deadline: AbortSignal) =>
    this.ask({ kind: "page", page }, deadline, (value) => ArticleReadingSchema.parse(value));

  stop(): void {
    this.restart(new Error("the page reader stopped"));
  }

  private restart(error: Readonly<Error>): void {
    const { worker } = this;

    if (worker !== null) {
      this.worker = null;
      this.failAll(error);
      void worker.terminate();
    }
  }

  private async ask<Answer>(
    request: Readonly<Request>,
    deadline: AbortSignal,
    parse: (value: Answered) => Answer,
  ): Promise<Answer> {
    if (deadline.aborted) {
      throw new PageReadTimeout();
    }

    const id = this.nextId;
    this.nextId += 1;
    const worker = this.workerThread();

    const value = await new Promise<Answered>((succeed, fail) => {
      const onDeadline = (): void => {
        this.restart(new PageReadTimeout());
      };

      const done = (): void => {
        deadline.removeEventListener("abort", onDeadline);
      };

      deadline.addEventListener("abort", onDeadline, { once: true });

      this.pending.set(id, {
        succeed: (answer) => {
          done();
          succeed(answer);
        },
        fail: (error) => {
          done();
          fail(error);
        },
      });

      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads ports have no target origin
      worker.postMessage({ id, ...request });
    });

    return parse(value);
  }

  private workerThread(): Worker {
    if (this.worker !== null) {
      return this.worker;
    }

    const worker = new Worker(WORKER_FILE);
    worker.unref();

    const lose = (error: Readonly<Error>): void => {
      if (this.worker === worker) {
        this.worker = null;
        this.failAll(error);
      }
    };

    worker.on("message", (message) => {
      const reply = ReplySchema.parse(message);
      const entry = this.pending.get(reply.id);
      this.pending.delete(reply.id);

      if (reply.ok) {
        entry?.succeed(reply.value);
      } else {
        entry?.fail(new Error(reply.message));
      }
    });

    worker.on("error", lose);

    worker.on("exit", (code) => {
      lose(new Error(`the page reader stopped with code ${String(code)}`));
    });

    this.worker = worker;

    return worker;
  }

  private failAll(error: Readonly<Error>): void {
    for (const entry of this.pending.values()) {
      entry.fail(error);
    }

    this.pending.clear();
  }
}
