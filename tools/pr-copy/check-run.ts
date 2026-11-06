import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { ScenarioName } from "./check-types.ts";
import { type Stage, copyNames, databaseId, inventory } from "./cloudflare.ts";
import { currentVersion, resumeDelivery, workerSettings } from "./copy-control.ts";
import { currentCopy } from "./copy-head.ts";
import { pullRequest, staleReason } from "./github.ts";
import { copyConfig, withStage } from "./stage.ts";
import { readInvocations } from "./telemetry.ts";

export class Stop extends Error {}

export interface CheckOptions {
  readonly pr: number;
  readonly head: string;
  readonly artifact: string;
  readonly scenarios: readonly ScenarioName[];
}

export interface Run {
  readonly stage: Readonly<Stage>;
  readonly pr: number;
  readonly head: string;
  readonly url: string;
  readonly version: string;
  readonly database: Readonly<{ name: string; id: string }>;
  readonly tag: string;
  readonly cpuLimitMs: number;
  readonly crons: readonly string[];
}

const PROBE_WINDOW_MS = 300_000;

async function currentUrl(options: Readonly<CheckOptions>): Promise<string> {
  const { pr, head } = options;
  const stale = staleReason({ pr, headSha: head }, await pullRequest(pr));

  if (stale !== null) throw new Stop(stale);

  const copy = await currentCopy(pr);

  if (copy === null) throw new Stop(`pull request ${String(pr)} has no copy`);

  if (copy.head !== head) {
    throw new Stop(`the copy of pull request ${String(pr)} is at ${copy.head}, not ${head}`);
  }

  const { protocol, hostname } = new URL(copy.url);

  if (
    protocol !== "https:" ||
    !hostname.startsWith(`threadsift-pr-${String(pr)}.`) ||
    !hostname.endsWith(".workers.dev")
  ) {
    throw new Stop(`the copy of pull request ${String(pr)} is not at a workers.dev address`);
  }

  return copy.url;
}

async function probeTelemetry(stage: Readonly<Stage>, version: string): Promise<void> {
  const now = Date.now();

  try {
    await readInvocations(stage, { version }, { from: now - PROBE_WINDOW_MS, to: now });
  } catch (error) {
    const reason =
      error instanceof z.ZodError
        ? `its answer did not match the expected shape at ${error.issues[0]?.path.join(".") ?? ""}`
        : error instanceof Error
          ? error.message
          : "unknown error";

    throw new Stop(
      `the telemetry query failed (${reason}); the token needs Workers Observability Write`,
      { cause: error },
    );
  }
}

async function prepare(stage: Readonly<Stage>, options: Readonly<CheckOptions>): Promise<Run> {
  const url = await currentUrl(options);
  const { name, queue } = stage.target;
  const settings = await workerSettings(stage, name);

  if (!settings.logsOn || !settings.sampledAtOne) {
    throw new Stop(
      `${name} has no Workers Logs with invocation logs at sampling 1; deploy it again`,
    );
  }

  const version = await currentVersion(stage, name);

  if (options.scenarios.some((scenario) => scenario !== "unreachable")) {
    await probeTelemetry(stage, version);
  }

  const config = copyConfig(stage.target, options.artifact);
  const database = { name, id: await databaseId(name) };

  if ((await currentUrl(options)) !== url) throw new Stop("the copy moved during the preflight");

  if (await resumeDelivery(stage)) {
    process.stdout.write(`${queue} was left paused by an earlier run; resumed it\n`);
  }

  return {
    stage,
    pr: options.pr,
    head: options.head,
    url,
    version,
    database,
    tag: randomBytes(4).toString("hex"),
    cpuLimitMs: config.limits.cpu_ms,
    crons: config.triggers.crons,
  };
}

export function withRun<Result>(
  options: Readonly<CheckOptions>,
  work: (run: Readonly<Run>) => Promise<Result>,
): Promise<Result> {
  return withStage(copyNames(options.pr), null, async (stage) => {
    const run = await prepare(stage, options);

    try {
      return await work(run);
    } finally {
      await resumeDelivery(stage);
    }
  });
}

export function resumeOnly(pr: number): Promise<boolean> {
  return withStage(copyNames(pr), null, async (stage) => {
    const found = await inventory(stage.target);

    return found.queues.length > 0 && (await resumeDelivery(stage));
  });
}
