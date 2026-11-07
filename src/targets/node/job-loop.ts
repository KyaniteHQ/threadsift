import type { JobPorts } from "../../core/job-outcome.ts";
import { abandonRunning, claimNextDue, executeClaimed } from "../../core/jobs.ts";
import type { JobQueue } from "../../core/ports.ts";
import { tick } from "../../core/tick.ts";

const LOOP_WIDTH = 4;
const LOOP_POLL_MS = 5000;
const TICK_MS = 60_000;

function report(what: string, error: Readonly<Error>): void {
  console.error(`${what}: ${error.message}`);
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

  async start(ports: JobPorts): Promise<void> {
    await abandonRunning(ports.db);
    this.ports = ports;

    this.timers.push(
      setInterval(() => {
        this.wake();
      }, LOOP_POLL_MS),
      setInterval(() => {
        tick(ports).catch((error: Readonly<Error>) => {
          report("The minute tick failed", error);
        });
      }, TICK_MS),
    );

    this.wake();
  }

  stop(): void {
    this.ports = null;

    for (const timer of this.timers) {
      clearInterval(timer);
    }
  }

  private wake(): void {
    this.drain().catch((error: Readonly<Error>) => {
      report("The job loop could not read the next job", error);
    });
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

    executeClaimed(ports, job)
      .catch((error: Readonly<Error>) => {
        report(`Job ${job.id} could not be finished`, error);
      })
      .finally(() => {
        this.running -= 1;
        this.wake();
      });

    await this.startJobs();
  }
}
