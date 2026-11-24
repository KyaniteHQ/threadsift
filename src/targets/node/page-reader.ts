import { Worker } from "node:worker_threads";

import type { ArticleReading } from "../../core/kernel/article.ts";
import { PageReadTimeout } from "../../core/kernel/page-read-timeout.ts";
import {
  type PageReader,
  type PageRequest,
  type PageSource,
  type RequestsAnswering,
  pageReaderOver,
} from "../../core/kernel/page-reader.ts";
import type { Reply } from "./page-reader-protocol.ts";

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

const POST_FAILED = "the page reader could not take the request";

const REPLY_FAILED = "the page reader reply failed";

function asError(cause: unknown, fallback: string): Error {
  return cause instanceof Error ? cause : new Error(fallback);
}

class PageThread implements PageSource {
  private state: State = { kind: "idle" };
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();

  stop(): void {
    this.terminate();
    this.state = { kind: "stopped" };
    this.failAll(new Error(STOPPED));
  }

  ask(request: Readonly<RequestsAnswering<string>>, deadline: AbortSignal): Promise<string>;
  ask(
    request: Readonly<RequestsAnswering<ArticleReading>>,
    deadline: AbortSignal,
  ): Promise<ArticleReading>;
  ask(request: Readonly<PageRequest>, deadline: AbortSignal): Promise<Answered> {
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
    if (!this.reject(id, new PageReadTimeout())) return;

    this.terminate();

    for (const [otherId, other] of this.pending) this.post(otherId, other.request);
  }

  private taken(id: number): Pending | undefined {
    const entry = this.pending.get(id);

    this.pending.delete(id);

    return entry;
  }

  private reject(id: number, error: Readonly<Error>): boolean {
    const entry = this.taken(id);

    entry?.fail(error);

    return entry !== undefined;
  }

  private terminate(): void {
    if (this.state.kind !== "running") return;

    const { worker } = this.state;

    this.state = { kind: "idle" };
    void worker.terminate();
  }

  private post(id: number, request: PageRequest): void {
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads ports have no target origin
      this.workerThread().postMessage({ id, ...request });
    } catch (cause) {
      this.reject(id, asError(cause, POST_FAILED));
    }
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
        this.failAll(asError(cause, REPLY_FAILED));
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
    const entry = this.taken(answer.id);

    if (entry === undefined) return;

    if (answer.ok) entry.succeed(answer.value);
    else entry.fail(new Error(answer.message));
  }

  private failAll(error: Readonly<Error>): void {
    for (const entry of this.pending.values()) entry.fail(error);

    this.pending.clear();
  }
}

export function threadPageReader(): PageReader & { readonly stop: () => void } {
  const thread = new PageThread();

  return {
    ...pageReaderOver(MAX_HTML_BYTES, thread),
    stop: () => {
      thread.stop();
    },
  };
}
