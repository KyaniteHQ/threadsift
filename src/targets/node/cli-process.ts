import { spawn } from "node:child_process";

import { Capture } from "./cli-capture.ts";

export const KILL_GRACE_MS = 5000;

export interface ProcessSpec {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdin: string;
  readonly stdoutCap: number;
  readonly stderrCap: number;
}

export type ProcessEnd =
  | {
      readonly kind: "exited";
      readonly code: number | null;
      readonly stdout: string;
    }
  | { readonly kind: "aborted" }
  | { readonly kind: "over-cap" }
  | { readonly kind: "spawn-failed" };

function signalGroup(pid: number, signal: "SIGTERM" | "SIGKILL" | 0): boolean {
  try {
    process.kill(-pid, signal);

    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;

    throw error;
  }
}

class Execution {
  private readonly child;
  private readonly out: Capture;
  private readonly err: Capture;
  private readonly signal: AbortSignal;
  private readonly finish: (end: ProcessEnd) => void;
  private overCap = false;
  private killTimer: NodeJS.Timeout | null = null;
  private readonly onAbort = (): void => {
    this.stop();
  };

  constructor(spec: Readonly<ProcessSpec>, signal: AbortSignal, finish: (end: ProcessEnd) => void) {
    this.signal = signal;
    this.finish = finish;
    this.out = new Capture(spec.stdoutCap, true);
    this.err = new Capture(spec.stderrCap, false);

    this.child = spawn(spec.file, [...spec.args], {
      cwd: spec.cwd,
      env: { ...spec.env },
      shell: false,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.on("data", (chunk: Uint8Array) => {
      if (!this.out.add(chunk)) this.overflowed();
    });

    this.child.stderr.on("data", (chunk: Uint8Array) => {
      if (!this.err.add(chunk)) this.overflowed();
    });

    this.child.stdin.on("error", () => {
      this.stop();
    });
    this.child.stdin.end(spec.stdin);
    this.child.on("error", () => {
      this.failedToStart();
    });
    this.child.on("exit", () => {
      this.reapGroup();
    });
    this.child.on("close", (code) => {
      this.closed(code);
    });
    signal.addEventListener("abort", this.onAbort, { once: true });
  }

  private overflowed(): void {
    this.overCap = true;
    this.stop();
  }

  private stop(): void {
    const { pid } = this.child;

    if (this.killTimer !== null || pid === undefined || !signalGroup(pid, "SIGTERM")) return;

    this.killTimer = setTimeout(() => {
      if (signalGroup(pid, 0)) signalGroup(pid, "SIGKILL");
    }, KILL_GRACE_MS);
  }

  private reapGroup(): void {
    const { pid } = this.child;

    if (pid !== undefined) signalGroup(pid, "SIGKILL");
  }

  private failedToStart(): void {
    if (this.child.pid !== undefined) return;
    this.signal.removeEventListener("abort", this.onAbort);
    this.finish({ kind: "spawn-failed" });
  }

  private closed(code: number | null): void {
    if (this.killTimer !== null) clearTimeout(this.killTimer);
    this.signal.removeEventListener("abort", this.onAbort);

    if (this.signal.aborted) this.finish({ kind: "aborted" });
    else if (this.overCap) this.finish({ kind: "over-cap" });
    else this.finish({ kind: "exited", code, stdout: this.out.text() });
  }
}

export function runProcess(spec: Readonly<ProcessSpec>, signal: AbortSignal): Promise<ProcessEnd> {
  if (signal.aborted) return Promise.resolve({ kind: "aborted" });

  return new Promise((resolve) => {
    void new Execution(spec, signal, resolve);
  });
}
