export class Capture {
  private readonly chunks: Uint8Array[] = [];
  private readonly cap: number;
  private readonly keep: boolean;
  private bytes = 0;

  constructor(cap: number, keep: boolean) {
    this.cap = cap;
    this.keep = keep;
  }

  add(chunk: Uint8Array): boolean {
    this.bytes += chunk.length;

    if (this.bytes > this.cap) return false;

    if (this.keep) this.chunks.push(chunk);

    return true;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}
