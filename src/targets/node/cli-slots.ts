type Release = () => void;

export class Slots {
  private free: number;
  private readonly waiting: (() => void)[] = [];

  constructor(width: number) {
    this.free = width;
  }

  acquire(signal: AbortSignal): Promise<Release | null> {
    if (signal.aborted) return Promise.resolve(null);

    if (this.free > 0) {
      this.free -= 1;

      return Promise.resolve(this.grant());
    }

    return new Promise((resolve) => {
      const onAbort = (): void => {
        this.waiting.splice(this.waiting.indexOf(handOver), 1);
        resolve(null);
      };

      const handOver = (): void => {
        signal.removeEventListener("abort", onAbort);

        if (signal.aborted) {
          resolve(null);
          this.pass();

          return;
        }

        resolve(this.grant());
      };

      this.waiting.push(handOver);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private grant(): Release {
    let held = true;

    return () => {
      if (!held) return;
      held = false;
      this.pass();
    };
  }

  private pass(): void {
    const next = this.waiting.shift();

    if (next === undefined) this.free += 1;
    else next();
  }
}
