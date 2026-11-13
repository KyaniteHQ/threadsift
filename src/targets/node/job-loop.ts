import { setTimeout } from "node:timers/promises";

import { migrateData } from "../../core/data-steps.ts";
import { logFailure, report } from "../../core/failure-log.ts";
import type { JobPorts } from "../../core/job-outcome.ts";
import { abandonRunning, claimNextDue, executeClaimed } from "../../core/jobs.ts";
import { HOP_DEADLINE_MS, type JobQueue } from "../../core/ports.ts";
import { tick } from "../../core/tick.ts";

const LOOP_WIDTH = 4;
const LOOP_POLL_MS = 5000;
const TICK_MS = 60_000;
const STOP_WAIT_MS = HOP_DEADLINE_MS + 1000;

function reportFailure(what: string, error: Readonly<Error>): void {
  logFailure("job-loop-failed", { what }, error);
}

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | {
      readonly kind: "running";
      readonly ports: JobPorts;
      readonly timers: readonly NodeJS.Timeout[];
    }
  | { readonly kind: "stopping" }
  | { readonly kind: "stopped" };

interface Run {
  readonly jobId: number;
  readonly claimExpires: number;
  abandoned: boolean;
}

export class JobLoop {
  readonly queue: JobQueue = {
    enqueue: () => {
      this.wake();

      return Promise.resolve();
    },
  };

  private state: State = { kind: "idle" };
  private ticking = false;
  private draining = false;
  private wokenWhileDraining = false;
  private readonly runs = new Set<Run>();
  private readonly inFlight = new Set<Promise<void>>();

  async start(ports: JobPorts): Promise<void> {
    if (this.state.kind !== "idle") return;

    this.state = { kind: "starting" };

    try {
      await abandonRunning(ports.db);

      await migrateData(ports.db).catch((error: Readonly<Error>) => {
        reportFailure("The data steps failed", error);
      });
    } catch (error) {
      this.state = { kind: "idle" };

      throw error;
    }

    if (this.kind() !== "starting") return;

    this.state = {
      kind: "running",
      ports,
      timers: [
        setInterval(() => {
          this.wake();
        }, LOOP_POLL_MS),
        setInterval(() => {
          this.tick(ports);
        }, TICK_MS),
      ],
    };

    this.wake();
  }

  async stop(): Promise<void> {
    const { state } = this;

    if (state.kind === "idle" || state.kind === "starting") {
      this.state = { kind: "stopped" };

      return;
    }

    if (state.kind !== "running") return;

    this.state = { kind: "stopping" };

    for (const timer of state.timers) {
      clearInterval(timer);
    }

    await this.settleWithin(STOP_WAIT_MS);
    this.state = { kind: "stopped" };
  }

  private kind(): State["kind"] {
    return this.state.kind;
  }

  private async settleWithin(waitMs: number): Promise<void> {
    const waiting = new AbortController();

    await Promise.race([
      this.settle().finally(() => {
        waiting.abort();
      }),
      setTimeout(waitMs, undefined, { signal: waiting.signal }).catch(() => {}),
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

  private tick(ports: JobPorts): void {
    if (this.ticking) return;

    this.ticking = true;

    this.track(() =>
      tick(ports)
        .catch((error: Readonly<Error>) => {
          reportFailure("The minute tick failed", error);
        })
        .finally(() => {
          this.ticking = false;
        }),
    );
  }

  private wake(): void {
    this.track(() => this.drain());
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      this.wokenWhileDraining = true;

      return;
    }

    this.draining = true;

    try {
      do {
        this.wokenWhileDraining = false;

        // oxlint-disable-next-line eslint/no-await-in-loop -- a wake that arrives during a pass starts one more pass.
        await this.startJobs().catch((error: Readonly<Error>) => {
          reportFailure("The job loop could not read the next job", error);
        });
      } while (this.wokenWhileDraining);
    } finally {
      this.draining = false;
    }
  }

  private liveRuns(now: number): number {
    let live = 0;

    for (const run of this.runs) {
      if (run.claimExpires > now) {
        live += 1;
      } else if (!run.abandoned) {
        run.abandoned = true;
        report("job-run-abandoned", { jobId: run.jobId });
      }
    }

    return live;
  }

  private async startJobs(): Promise<void> {
    const { state } = this;

    if (state.kind !== "running" || this.liveRuns(Date.now()) >= LOOP_WIDTH) {
      return;
    }

    const job = await claimNextDue(state.ports.db);

    if (job === null) {
      return;
    }

    const run: Run = { jobId: job.id, claimExpires: job.claimExpires ?? 0, abandoned: false };
    this.runs.add(run);

    this.track(() =>
      executeClaimed(state.ports, job)
        .catch((error: Readonly<Error>) => {
          reportFailure(`Job ${job.id} could not be finished`, error);
        })
        .finally(() => {
          this.runs.delete(run);
          this.wake();
        }),
    );

    await this.startJobs();
  }
}
