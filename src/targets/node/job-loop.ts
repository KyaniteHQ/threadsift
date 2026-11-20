import { setTimeout } from "node:timers/promises";

import { logFailure } from "../../core/failure-log.ts";
import type { JobPorts } from "../../core/job-outcome.ts";
import type { JobQueue } from "../../core/job-queue.ts";
import { abandonRunning, claimNextDue, executeClaimed } from "../../core/jobs.ts";
import { NOTHING } from "../../core/nothing.ts";
import { HOP_DEADLINE_MS } from "../../core/request-waits.ts";
import { tick } from "../../core/tick.ts";
import { CAPACITY } from "./capacity.ts";

const LOOP_POLL_MS = 5000;
const TICK_MS = 60_000;
const STOP_WAIT_MS = HOP_DEADLINE_MS + 1000;

function reportFailure(what: string, error: Readonly<Error>): void {
  logFailure("job-loop-failed", { what }, error);
}

export class JobLoop {
  readonly queue: JobQueue = {
    enqueue: () => {
      this.wake();

      return Promise.resolve();
    },
  };

  private running = false;
  private ticking = false;
  private draining = false;
  private woken = false;
  private readonly ports: () => JobPorts;
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly runs = new Set<Promise<void>>();
  private readonly inFlight = new Set<Promise<void>>();

  constructor(ports: () => JobPorts) {
    this.ports = ports;
  }

  async start(): Promise<void> {
    await abandonRunning(this.ports().db);
    this.running = true;

    this.timers.push(
      setInterval(() => {
        this.wake();
      }, LOOP_POLL_MS),
      setInterval(() => {
        this.tick();
      }, TICK_MS),
    );
    this.wake();
  }

  async stop(): Promise<void> {
    this.running = false;

    for (const timer of this.timers) clearInterval(timer);

    await this.settleWithin(STOP_WAIT_MS);
  }

  private async settleWithin(waitMs: number): Promise<void> {
    const waiting = new AbortController();

    await Promise.race([
      this.settle().finally(() => {
        waiting.abort();
      }),
      setTimeout(waitMs, undefined, { signal: waiting.signal }).catch(NOTHING),
    ]);
  }

  private async settle(): Promise<void> {
    if (this.inFlight.size === 0) {
      return;
    }

    await Promise.all(this.inFlight);
    await this.settle();
  }

  private track(start: () => Promise<void>): void {
    const tracked = start().finally(() => {
      this.inFlight.delete(tracked);
    });

    this.inFlight.add(tracked);
  }

  private wake(): void {
    if (!this.running) return;

    if (this.draining) {
      this.woken = true;

      return;
    }

    this.woken = false;
    this.draining = true;
    this.track(() =>
      this.startJobs(this.ports())
        .catch((error: Readonly<Error>) => {
          reportFailure("The job loop could not read the next job", error);
        })
        .finally(() => {
          this.draining = false;

          if (this.woken) this.wake();
        }),
    );
  }

  private tick(): void {
    if (this.ticking) return;

    this.ticking = true;

    this.track(() =>
      tick(this.ports())
        .catch((error: Readonly<Error>) => {
          reportFailure("The minute tick failed", error);
        })
        .finally(() => {
          this.ticking = false;
        }),
    );
  }

  private async startJobs(ports: JobPorts): Promise<void> {
    if (!this.running || this.runs.size >= CAPACITY.jobs) return;

    const job = await claimNextDue(ports.db);

    if (job === null) return;

    const run = executeClaimed(ports, job)
      .catch((error: Readonly<Error>) => {
        reportFailure(`Job ${job.id} could not be finished`, error);
      })
      .finally(() => {
        this.runs.delete(run);
        this.wake();
      });

    this.runs.add(run);
    this.track(() => run);

    await this.startJobs(ports);
  }
}
