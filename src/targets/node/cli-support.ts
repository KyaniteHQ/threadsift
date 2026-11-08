import { access, constants, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";

import type { z } from "zod";

import { type CliProvider, refusedAi } from "../../core/ai-contract.ts";
import type { ProcessEnd } from "./cli-process.ts";

export const STDOUT_CAP = 1024 * 1024;
export const STDERR_CAP = 64 * 1024;
export const PROBE_MS = 15_000;

const FIXED_PATH = ["/usr/local/bin", "/usr/bin", "/bin"];

export function parsedJson<Parsed>(schema: z.ZodType<Parsed>, text: string): Parsed | null {
  try {
    return schema.safeParse(JSON.parse(text)).data ?? null;
  } catch {
    return null;
  }
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

export function present(name: string, value: string | undefined): [string, string][] {
  return value === undefined ? [] : [[name, value]];
}

export function exitCode(end: Readonly<ProcessEnd>): number | null {
  return end.kind === "exited" ? end.code : null;
}

export function report(provider: CliProvider, reason: string, code: number | null): void {
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
