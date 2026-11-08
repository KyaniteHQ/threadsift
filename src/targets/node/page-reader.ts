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

const AnswerSchema = z.union([
  ReplySchema,
  z.object({ id: z.number() }).transform(({ id }) => ({
    id,
    ok: false as const,
    message: "the page reader sent an answer that could not be read",
  })),
]);

type WorkerAnswer = z.infer<typeof AnswerSchema>;

type Answered = string | Readonly<ArticleReading>;

type Request =
  | { readonly kind: "title"; readonly html: string }
  | { readonly kind: "article"; readonly html: string; readonly url: string }
  | { readonly kind: "page"; readonly page: SuppliedPage };

interface Pending {
  readonly request: Request;
  readonly succeed: (value: Answered) => void;
  readonly fail: (error: Readonly<Error>) => void;
}

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly worker: Worker }
  | { readonly kind: "stopped" };

const MAX_HTML_BYTES = 5 * 1024 * 1024;

const STOPPED = "the page reader stopped";

export class WorkerPageReader implements PageReader {
  readonly maxHtmlBytes = MAX_HTML_BYTES;
  private state: State = { kind: "idle" };
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
    this.terminate();
    this.state = { kind: "stopped" };
    this.failAll(new Error(STOPPED));
  }

  private async ask<Answer>(
    request: Readonly<Request>,
    deadline: AbortSignal,
    parse: (value: Answered) => Answer,
  ): Promise<Answer> {
    if (this.state.kind === "stopped") throw new Error(STOPPED);

    if (deadline.aborted) throw new PageReadTimeout();

    const id = this.nextId;
    this.nextId += 1;

    const value = await new Promise<Answered>((succeed, fail) => {
      const onDeadline = (): void => {
        this.expire(id);
      };

      const done = (): void => {
        deadline.removeEventListener("abort", onDeadline);
      };

      deadline.addEventListener("abort", onDeadline, { once: true });

      this.pending.set(id, {
        request,
        succeed: (answer) => {
          done();
          succeed(answer);
        },
        fail: (error) => {
          done();
          fail(error);
        },
      });

      this.post(id, request);
    });

    return parse(value);
  }

  private expire(id: number): void {
    const entry = this.pending.get(id);

    if (entry === undefined) return;

    this.pending.delete(id);
    entry.fail(new PageReadTimeout());
    this.terminate();

    for (const [otherId, other] of this.pending) this.post(otherId, other.request);
  }

  private terminate(): void {
    if (this.state.kind !== "running") return;

    const { worker } = this.state;

    this.state = { kind: "idle" };
    void worker.terminate();
  }

  private post(id: number, request: Request): void {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads ports have no target origin
    this.workerThread().postMessage({ id, ...request });
  }

  private workerThread(): Worker {
    if (this.state.kind === "running") return this.state.worker;

    const worker = new Worker(WORKER_FILE);
    worker.unref();

    const lose = (error: Readonly<Error>): void => {
      if (this.state.kind === "running" && this.state.worker === worker) {
        this.state = { kind: "idle" };
        this.failAll(error);
      }
    };

    worker.on("message", (message) => {
      const answer = AnswerSchema.safeParse(message);

      if (answer.success) this.conclude(answer.data);
    });

    worker.on("error", lose);

    worker.on("exit", (code) => {
      lose(new Error(`the page reader stopped with code ${String(code)}`));
    });

    this.state = { kind: "running", worker };

    return worker;
  }

  private conclude(answer: Readonly<WorkerAnswer>): void {
    const entry = this.pending.get(answer.id);

    if (entry === undefined) return;

    this.pending.delete(answer.id);

    if (answer.ok) entry.succeed(answer.value);
    else entry.fail(new Error(answer.message));
  }

  private failAll(error: Readonly<Error>): void {
    for (const entry of this.pending.values()) entry.fail(error);

    this.pending.clear();
  }
}
