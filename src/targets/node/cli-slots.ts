export type Release = () => void;

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

      return Promise.resolve(this.release);
    }

    return new Promise((resolve) => {
      const onAbort = (): void => {
        this.waiting.splice(this.waiting.indexOf(handOver), 1);
        resolve(null);
      };

      const handOver = (): void => {
        signal.removeEventListener("abort", onAbort);
        resolve(this.release);
      };

      this.waiting.push(handOver);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private readonly release: Release = () => {
    const next = this.waiting.shift();

    if (next === undefined) this.free += 1;
    else next();
  };
}
