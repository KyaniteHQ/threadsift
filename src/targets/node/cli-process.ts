import { spawn } from "node:child_process";
import { access, constants, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";

import { PROBE_MS } from "../../core/contract/request-waits.ts";
import { errnoCodeOf, withCleanup } from "../../core/kernel/failure-log.ts";
import { Capture } from "./cli-capture.ts";
import { holdSlotUntil } from "./cli-slots.ts";

const KILL_GRACE_MS = 5000;
const STDERR_CAP = 64 * 1024;
const FIXED_PATH = ["/usr/local/bin", "/usr/bin", "/bin"];

interface ProcessSpec {
  readonly binary: string;
  readonly args: readonly string[];
  readonly extraEnv: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdin: string;
  readonly stdoutCap: number;
  readonly keepStdout: boolean;
}

export interface ChildFolders {
  readonly root: string;
  readonly cwd: string;
  readonly home: string;
}

export type ProcessEnd =
  | {
      readonly kind: "exited";
      readonly code: number | null;
      readonly stdout: string;
      readonly stderr: string;
    }
  | { readonly kind: "aborted" }
  | { readonly kind: "over-cap" }
  | { readonly kind: "spawn-failed" };

export type UnfinishedEnd = Exclude<ProcessEnd, { readonly kind: "exited" }>;

export function signalGroup(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (errnoCodeOf(error) === "ESRCH") return;

    throw error;
  }
}

type Phase = "running" | "stopping" | "exited" | "done";

type Ending = Exclude<UnfinishedEnd["kind"], "spawn-failed">;

interface Outlets {
  readonly answer: (end: ProcessEnd) => void;
  readonly free: () => void;
}

class Execution {
  private readonly child;
  private readonly out: Capture;
  private readonly err: Capture;
  private readonly signal: AbortSignal;
  private readonly outlets: Outlets;
  private phase: Phase = "running";
  private ending: Ending | null = null;
  private exitCode: number | null = null;
  private answered = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly onAbort = (): void => {
    this.ending ??= "aborted";
    this.stop();
  };

  constructor(spec: Readonly<ProcessSpec>, signal: AbortSignal, outlets: Readonly<Outlets>) {
    this.signal = signal;
    this.outlets = outlets;
    this.out = new Capture(spec.stdoutCap, spec.keepStdout);
    this.err = new Capture(STDERR_CAP, true);

    this.child = spawn(spec.binary, [...spec.args], {
      cwd: spec.cwd,
      env: { ...spec.extraEnv, PATH: childPath(spec.binary) },
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
      this.closed(code);
    });
    signal.addEventListener("abort", this.onAbort, { once: true });
  }

  private overflowed(): void {
    this.ending ??= "over-cap";
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
    this.signal.removeEventListener("abort", this.onAbort);
    this.signalChildGroup("SIGKILL");
    this.arm(KILL_GRACE_MS, () => {
      this.abandonPipes();
    });
    setImmediate(() => {
      this.answer();
    });
  }

  private signalChildGroup(signal: "SIGTERM" | "SIGKILL"): void {
    const { pid } = this.child;

    if (pid !== undefined) signalGroup(pid, signal);
  }

  private abandonPipes(): void {
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    this.closed(this.exitCode);
  }

  private failedToStart(): void {
    if (this.child.pid !== undefined) return;
    this.answerWith({ kind: "spawn-failed" });
    this.closed(null);
  }

  private answer(): void {
    this.answerWith(
      this.ending === null
        ? { kind: "exited", code: this.exitCode, stdout: this.out.text(), stderr: this.err.text() }
        : { kind: this.ending },
    );
  }

  private answerWith(end: ProcessEnd): void {
    if (this.answered) return;

    this.answered = true;
    this.signal.removeEventListener("abort", this.onAbort);
    this.outlets.answer(end);
  }

  private closed(code: number | null): void {
    if (this.phase === "done") return;

    if (this.phase !== "exited") this.exitCode = code;

    this.phase = "done";

    if (this.timer !== null) clearTimeout(this.timer);
    this.answer();
    this.outlets.free();
  }
}

export function runProcess(spec: Readonly<ProcessSpec>, signal: AbortSignal): Promise<ProcessEnd> {
  if (signal.aborted) return Promise.resolve({ kind: "aborted" });

  const freed = Promise.withResolvers<void>();

  holdSlotUntil(() => freed.promise);

  return new Promise((resolve) => {
    void new Execution(spec, signal, {
      answer: resolve,
      free: () => {
        freed.resolve();
      },
    });
  });
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);

    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function findBinary(path: string, name: string): Promise<string | null> {
  const candidates = path
    .split(delimiter)
    .filter((dir) => isAbsolute(dir))
    .map((dir) => join(dir, name));

  const found = await Promise.all(candidates.map((candidate) => isExecutable(candidate)));

  return candidates.find((_candidate, index) => found[index] === true) ?? null;
}

function childPath(binary: string): string {
  return [dirname(binary), ...FIXED_PATH].join(delimiter);
}

export async function inEmptyFolder<Result>(
  work: (folder: string) => Promise<Result>,
): Promise<Result> {
  const folder = await mkdtemp(join(tmpdir(), "threadsift-cli-"));

  return withCleanup(
    { event: "cli-folder-not-removed", fields: {} },
    () => work(folder),
    () => rm(folder, { recursive: true, force: true }),
  );
}

export function inChildFolders<Result>(work: (folders: ChildFolders) => Promise<Result>) {
  return inEmptyFolder(async (root) => {
    const folders = { root, cwd: join(root, "cwd"), home: join(root, "home") };

    await Promise.all([mkdir(folders.cwd), mkdir(folders.home)]);

    return work(folders);
  });
}

export function within(signal: AbortSignal, ms: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

export function answerWithin<Answer>(
  shutdown: AbortSignal,
  probe: (signal: AbortSignal) => Promise<Answer>,
  unanswered: Answer,
): Promise<Answer> {
  const deadline = AbortSignal.any([AbortSignal.timeout(PROBE_MS), shutdown]);
  const answer = new Promise<Answer>((resolve) => {
    resolve(probe(deadline));
  }).catch(() => unanswered);

  const expired = new Promise<Answer>((resolve) => {
    deadline.addEventListener("abort", () => {
      resolve(unanswered);
    });
  });

  return Promise.race([answer, expired]);
}
