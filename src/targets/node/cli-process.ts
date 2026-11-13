import { spawn } from "node:child_process";

import { Capture } from "./cli-capture.ts";
import { hasErrnoCode } from "./errno.ts";

const KILL_GRACE_MS = 5000;

interface ProcessSpec {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdin: string;
  readonly stdoutCap: number;
  readonly stderrCap: number;
  readonly keepStdout: boolean;
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

function signalGroup(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (hasErrnoCode(error, "ESRCH")) return;

    throw error;
  }
}

type Phase = "running" | "stopping" | "exited" | "done";

class Execution {
  private readonly child;
  private readonly out: Capture;
  private readonly err: Capture;
  private readonly signal: AbortSignal;
  private readonly finish: (end: ProcessEnd) => void;
  private phase: Phase = "running";
  private overCap = false;
  private exitCode: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly onAbort = (): void => {
    this.stop();
  };

  constructor(spec: Readonly<ProcessSpec>, signal: AbortSignal, finish: (end: ProcessEnd) => void) {
    this.signal = signal;
    this.finish = finish;
    this.out = new Capture(spec.stdoutCap, spec.keepStdout);
    this.err = new Capture(spec.stderrCap, false);

    this.child = spawn(spec.file, [...spec.args], {
      cwd: spec.cwd,
      env: { ...spec.env },
      shell: false,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.on("error", () => {
      this.failedToStart();
    });

    if (this.child.pid === undefined) return;

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
    this.child.on("exit", (code) => {
      this.exited(code);
    });
    this.child.on("close", (code) => {
      this.settle(code);
    });
    signal.addEventListener("abort", this.onAbort, { once: true });
  }

  private overflowed(): void {
    this.overCap = true;
    this.stop();
  }

  private arm(afterMs: number, run: () => void): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(run, afterMs);
  }

  private stop(): void {
    if (this.phase !== "running") return;

    this.phase = "stopping";
    this.signalChildGroup("SIGTERM");
    this.arm(KILL_GRACE_MS, () => {
      this.signalChildGroup("SIGKILL");
      this.arm(KILL_GRACE_MS, () => {
        this.abandonPipes();
      });
    });
  }

  private exited(code: number | null): void {
    if (this.phase === "done") return;

    this.phase = "exited";
    this.exitCode = code;
    this.signalChildGroup("SIGKILL");
    this.arm(KILL_GRACE_MS, () => {
      this.abandonPipes();
    });
  }

  private signalChildGroup(signal: "SIGTERM" | "SIGKILL"): void {
    const { pid } = this.child;

    if (pid !== undefined) signalGroup(pid, signal);
  }

  private abandonPipes(): void {
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    this.settle(this.exitCode);
  }

  private failedToStart(): void {
    if (this.child.pid !== undefined) return;
    this.settleWith({ kind: "spawn-failed" });
  }

  private settle(code: number | null): void {
    if (this.signal.aborted) this.settleWith({ kind: "aborted" });
    else if (this.overCap) this.settleWith({ kind: "over-cap" });
    else this.settleWith({ kind: "exited", code, stdout: this.out.text() });
  }

  private settleWith(end: ProcessEnd): void {
    if (this.phase === "done") return;

    this.phase = "done";

    if (this.timer !== null) clearTimeout(this.timer);
    this.signal.removeEventListener("abort", this.onAbort);
    this.finish(end);
  }
}

export function runProcess(spec: Readonly<ProcessSpec>, signal: AbortSignal): Promise<ProcessEnd> {
  if (signal.aborted) return Promise.resolve({ kind: "aborted" });

  return new Promise((resolve) => {
    void new Execution(spec, signal, resolve);
  });
}
