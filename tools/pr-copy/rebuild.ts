import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { probeTelemetry, verifiedCopy } from "./check-run.ts";
import { cloudflare, copyNames, deleteDatabase } from "./cloudflare.ts";
import { currentVersion } from "./copy-control.ts";
import { type CopyRecord, deployCopy } from "./copy.ts";
import { lastRecord, pullRequest } from "./github.ts";
import { RUN_BUDGET_MS } from "./pace.ts";
import {
  type Evidence,
  type Failure,
  NO_EVIDENCE,
  type Outcome,
  classify,
  exceptionLog,
  needsLog,
} from "./rebuild-log.ts";
import { readWorkerConfig, withStage } from "./stage.ts";

export const MAX_REBUILDS = 20;

export interface RebuildOptions {
  readonly pr: number;
  readonly head: string;
  readonly artifact: string;
  readonly times: number;
}

type Attempt = Evidence &
  Readonly<{
    n: number;
    outcome: Outcome;
    route: string | null;
    status: number | null;
    stop: string | null;
  }>;

async function draftReason(options: Readonly<RebuildOptions>): Promise<string | null> {
  const name = `pull request ${String(options.pr)}`;
  const pull = await pullRequest(options.pr);

  if (pull.state !== "open") return `${name} is closed`;

  if (!pull.draft) return `${name} is not a draft; only a throwaway draft is rebuilt`;

  if (pull.head.sha !== options.head) return `${name} is at ${pull.head.sha} now`;

  try {
    await verifiedCopy(options);
  } catch (error) {
    return error instanceof Error ? error.message : "the copy could not be verified";
  }

  return null;
}

async function preflight(options: Readonly<RebuildOptions>): Promise<void> {
  const reason = await draftReason(options);

  if (reason !== null) throw new Error(reason);

  const names = copyNames(options.pr);

  await withStage(names, null, async (stage) => {
    readWorkerConfig(options.artifact);
    await probeTelemetry(stage, await currentVersion(stage, names.name));
  });
}

function failed(n: number, failure: Readonly<Failure>, log: Readonly<Evidence>): Attempt {
  return { n, ...failure, ...log, stop: null };
}

async function attemptOf(
  options: Readonly<RebuildOptions>,
  n: number,
  record: CopyRecord | null,
): Promise<{ attempt: Attempt; record: CopyRecord | null }> {
  const names = copyNames(options.pr);
  const stop = await draftReason(options);

  if (stop !== null) {
    const stopped = {
      outcome: "stopped",
      route: null,
      status: null,
      at: Date.now(),
      note: null,
    } as const;

    return { attempt: { ...failed(n, stopped, NO_EVIDENCE), stop }, record };
  }

  await withStage(names, null, (stage) => cloudflare(stage, deleteDatabase(names.name)));

  try {
    const copy = await deployCopy(options.pr, options.artifact, record);

    const clean = {
      outcome: "clean",
      route: null,
      status: null,
      at: Date.now(),
      note: null,
    } as const;

    return { attempt: failed(n, clean, NO_EVIDENCE), record: copy.record };
  } catch (error) {
    const found = classify(error instanceof Error ? error : new Error("unexpected failure"));
    const log = needsLog(found) ? await exceptionLog(options.pr, found) : NO_EVIDENCE;

    return { attempt: failed(n, found, log), record };
  }
}

async function rebuildFrom(
  options: Readonly<RebuildOptions>,
  n: number,
  record: CopyRecord | null,
  done: readonly Attempt[],
  until: number,
): Promise<Attempt[]> {
  if (n > options.times) return [...done];

  const { attempt, record: next } = await attemptOf(options, n, record);
  const all = [...done, attempt];

  if (attempt.outcome !== "clean" || Date.now() >= until) return all;

  return rebuildFrom(options, n + 1, next, all, until);
}

export async function rebuildCopy(
  options: Readonly<RebuildOptions>,
  out: string,
): Promise<boolean> {
  await preflight(options);

  const attempts = await rebuildFrom(
    options,
    1,
    await lastRecord(options.pr),
    [],
    Date.now() + RUN_BUDGET_MS,
  );

  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "rebuild.json"),
    `${JSON.stringify({ pullRequest: options.pr, head: options.head, attempts }, null, 2)}\n`,
  );
  process.stdout.write(
    `${attempts.map((entry) => `${String(entry.n)}:${entry.outcome}`).join(" ")}\n`,
  );

  return attempts.length === options.times && attempts.every((entry) => entry.outcome === "clean");
}
