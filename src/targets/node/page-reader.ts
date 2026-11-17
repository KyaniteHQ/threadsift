import { Worker } from "node:worker_threads";

import type { ArticleReading } from "../../core/article.ts";
import { PageReadTimeout } from "../../core/page-read-timeout.ts";
import type { PageReader } from "../../core/ports.ts";
import type { SuppliedPage } from "../../core/supplied-page.ts";
import type { PageRequest, Reply } from "./page-reader-protocol.ts";

const WORKER_FILE = new URL("./page-reader-worker.ts", import.meta.url);

type Answered = string | Readonly<ArticleReading>;

interface Pending {
  readonly request: PageRequest;
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
    this.ask({ kind: "title", html }, deadline);

  readonly article = (html: string, url: string, deadline: AbortSignal) =>
    this.ask({ kind: "article", html, url }, deadline);

  readonly page = (page: SuppliedPage, deadline: AbortSignal) =>
    this.ask({ kind: "page", page }, deadline);

  stop(): void {
    this.terminate();
    this.state = { kind: "stopped" };
    this.failAll(new Error(STOPPED));
  }

  private ask(
    request: Readonly<Extract<PageRequest, { readonly kind: "title" }>>,
    deadline: AbortSignal,
  ): Promise<string>;
  private ask(
    request: Readonly<Exclude<PageRequest, { readonly kind: "title" }>>,
    deadline: AbortSignal,
  ): Promise<ArticleReading>;
  private ask(request: Readonly<PageRequest>, deadline: AbortSignal): Promise<Answered> {
    if (this.state.kind === "stopped") return Promise.reject(new Error(STOPPED));

    if (deadline.aborted) return Promise.reject(new PageReadTimeout());

    const id = this.nextId;
    this.nextId += 1;

    return new Promise<Answered>((succeed, fail) => {
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

  private post(id: number, request: PageRequest): void {
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

    worker.on("message", (answer: Reply) => {
      try {
        this.conclude(answer);
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error("the page reader reply failed");

        this.failAll(error);
      }
    });

    worker.on("error", lose);

    worker.on("exit", (code) => {
      lose(new Error(`the page reader stopped with code ${String(code)}`));
    });

    this.state = { kind: "running", worker };

    return worker;
  }

  private conclude(answer: Readonly<Reply>): void {
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
