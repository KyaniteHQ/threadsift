import { setTimeout } from "node:timers/promises";

import { logFailure } from "../../core/failure-log.ts";
import type { JobPorts } from "../../core/job-outcome.ts";
import { abandonRunning, claimNextDue, executeClaimed } from "../../core/jobs.ts";
import { HOP_DEADLINE_MS, type JobQueue } from "../../core/ports.ts";
import { tick } from "../../core/tick.ts";

const LOOP_WIDTH = 4;
const LOOP_POLL_MS = 5000;
const TICK_MS = 60_000;
const STOP_WAIT_MS = HOP_DEADLINE_MS + 1000;

function report(what: string, error: Readonly<Error>): void {
  logFailure("job-loop-failed", { what }, error);
}

export class JobLoop {
  readonly queue: JobQueue = {
    enqueue: () => {
      this.wake();

      return Promise.resolve();
    },
  };

  private ports: JobPorts | null = null;
  private running = 0;
  private draining = false;
  private wokenWhileDraining = false;
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly inFlight = new Set<Promise<void>>();

  async start(ports: JobPorts): Promise<void> {
    await abandonRunning(ports.db);
    this.ports = ports;

    this.timers.push(
      setInterval(() => {
        this.wake();
      }, LOOP_POLL_MS),
      setInterval(() => {
        this.track(() =>
          tick(ports).catch((error: Readonly<Error>) => {
            report("The minute tick failed", error);
          }),
        );
      }, TICK_MS),
    );

    this.wake();
  }

  async stop(): Promise<void> {
    this.ports = null;

    for (const timer of this.timers) {
      clearInterval(timer);
    }

    await Promise.race([this.settle(), setTimeout(STOP_WAIT_MS)]);
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
    this.track(() =>
      this.drain().catch((error: Readonly<Error>) => {
        report("The job loop could not read the next job", error);
      }),
    );
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      this.wokenWhileDraining = true;

      return;
    }

    this.draining = true;
    this.wokenWhileDraining = false;

    try {
      await this.startJobs();
    } finally {
      this.draining = false;
    }

    if (this.wokenWhileDraining) {
      await this.drain();
    }
  }

  private async startJobs(): Promise<void> {
    const { ports } = this;

    if (ports === null || this.running >= LOOP_WIDTH) {
      return;
    }

    const job = await claimNextDue(ports.db);

    if (job === null) {
      return;
    }

    this.running += 1;

    this.track(() =>
      executeClaimed(ports, job)
        .catch((error: Readonly<Error>) => {
          report(`Job ${job.id} could not be finished`, error);
        })
        .finally(() => {
          this.running -= 1;
          this.wake();
        }),
    );

    await this.startJobs();
  }
}
