import { access, constants, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";

import { z } from "zod";

import {
  type AiExecution,
  type AiTaskRequest,
  type CliProvider,
  refusedAi,
} from "../../core/ai-contract.ts";
import type { CliRunner } from "../shared/ai-runtime.ts";
import type { ProcessEnd } from "./cli-process.ts";
import type { Slots } from "./cli-slots.ts";

export const STDOUT_CAP = 1024 * 1024;
export const STDERR_CAP = 64 * 1024;
const PROBE_MS = 15_000;

const FIXED_PATH = ["/usr/local/bin", "/usr/bin", "/bin"];

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

export function childPath(binary: string): string {
  return [dirname(binary), ...FIXED_PATH].join(delimiter);
}

export async function inEmptyFolder<Result>(
  work: (folder: string) => Promise<Result>,
): Promise<Result> {
  const folder = await mkdtemp(join(tmpdir(), "threadsift-cli-"));

  try {
    return await work(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function answerWithin(
  shutdown: AbortSignal,
  probe: (signal: AbortSignal) => Promise<boolean>,
): Promise<boolean> {
  const deadline = AbortSignal.any([AbortSignal.timeout(PROBE_MS), shutdown]);
  const answer = probe(deadline).catch(() => false);

  const expired = new Promise<false>((resolve) => {
    deadline.addEventListener("abort", () => {
      resolve(false);
    });
  });

  return Promise.race([answer, expired]);
}

export function present(name: string, value: string | undefined): [string, string][] {
  return value === undefined ? [] : [[name, value]];
}

export function exitCode(end: Readonly<ProcessEnd>): number | null {
  return end.kind === "exited" ? end.code : null;
}

function report(provider: CliProvider, reason: string, code: number | null): void {
  console.error(JSON.stringify({ event: "cli-refused", provider, reason, exit: code }));
}

export function endRefusal(end: Exclude<ProcessEnd, { readonly kind: "exited" }>) {
  switch (end.kind) {
    case "aborted":
      return refusedAi("timeout");
    case "over-cap":
      return refusedAi("no-json");
    case "spawn-failed":
      return refusedAi("not-configured");
    default: {
      const exhaustive: never = end;

      return exhaustive;
    }
  }
}

export function outputSchema(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema, { target: "draft-7" }));
}

export function promptOf({ instructions, input }: Readonly<AiTaskRequest<unknown>>): string {
  return `${instructions}\n\n${input}`;
}

export interface Attempt<Result> {
  readonly result: AiExecution<Result>;
  readonly code: number | null;
}

export abstract class SlottedCli implements CliRunner {
  abstract readonly provider: CliProvider;
  private readonly shutdown = new AbortController();
  private readonly slots: Slots;

  constructor(slots: Slots) {
    this.slots = slots;
  }

  protected abstract probe(signal: AbortSignal): Promise<boolean>;

  protected abstract attempt<Result>(
    task: AiTaskRequest<Result>,
    model: string,
    signal: AbortSignal,
  ): Promise<Attempt<Result>>;

  protected refusalBeforeSlot(_model: string): AiExecution<never> | null {
    return null;
  }

  stop(): void {
    this.shutdown.abort();
  }

  readonly signedIn = (): Promise<boolean> =>
    answerWithin(this.shutdown.signal, (signal) => this.probe(signal));

  readonly run = async <Result>(
    task: AiTaskRequest<Result>,
    signal: AbortSignal,
  ): Promise<AiExecution<Result>> => {
    if (task.config.kind !== "cli") return refusedAi("unreachable");
    const { model } = task.config;
    const early = this.refusalBeforeSlot(model);

    if (early !== null) return early;

    const stop = AbortSignal.any([signal, this.shutdown.signal]);
    const release = await this.slots.acquire(stop);

    if (release === null) return refusedAi("timeout");

    try {
      const { result, code } = await this.attempt(task, model, stop);

      if (result.kind === "refused") report(this.provider, result.reason, code);

      return result;
    } finally {
      release();
    }
  };
}
