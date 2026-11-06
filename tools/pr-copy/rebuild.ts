import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cloudflare, copyNames, deleteDatabase } from "./cloudflare.ts";
import { CopyAnswerError } from "./copy-client.ts";
import { currentVersion } from "./copy-control.ts";
import { type CopyRecord, deployCopy } from "./copy.ts";
import { lastRecord, pullRequest, staleReason } from "./github.ts";
import { withStage } from "./stage.ts";
import { readInvocations } from "./telemetry.ts";

export const MAX_REBUILDS = 20;

const DEADLINE_MS = 270 * 60_000;
const APP_ERROR = "Internal error";
const WINDOW_SKEW_MS = 10_000;

export interface RebuildOptions {
  readonly pr: number;
  readonly head: string;
  readonly artifact: string;
  readonly times: number;
}

type Outcome = "clean" | "app-500" | "edge-failure" | "other-answer" | "other";

interface Attempt {
  readonly n: number;
  readonly outcome: Outcome;
  readonly route: string | null;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly exceptionLogged: boolean | null;
}

function classify(error: Readonly<Error>): Pick<Attempt, "outcome" | "route" | "status"> {
  if (!(error instanceof CopyAnswerError)) {
    return { outcome: "other", route: null, status: null };
  }

  const { status } = error;
  const route = error.path.replaceAll(/\/\d+(?=\/|$)/gu, "/:id");

  if (status === 500 && error.answer === APP_ERROR) return { outcome: "app-500", route, status };

  return { outcome: status >= 500 ? "edge-failure" : "other-answer", route, status };
}

function exceptionLog(
  pr: number,
  from: number,
): Promise<Pick<Attempt, "requestId" | "exceptionLogged">> {
  const names = copyNames(pr);

  return withStage(names, null, async (stage) => {
    const version = await currentVersion(stage, names.name);

    const failed = (
      await readInvocations(
        stage,
        { version, trigger: "fetch" },
        { from: from - WINDOW_SKEW_MS, to: Date.now() + WINDOW_SKEW_MS },
      )
    ).find((entry) => entry.status === 500);

    return { requestId: failed?.requestId ?? null, exceptionLogged: failed?.errorLogged ?? null };
  });
}

async function attemptOf(
  options: Readonly<RebuildOptions>,
  n: number,
  record: CopyRecord | null,
): Promise<{ attempt: Attempt; record: CopyRecord | null }> {
  const names = copyNames(options.pr);
  const started = Date.now();

  await withStage(names, null, (stage) => cloudflare(stage, deleteDatabase(names.name)));

  try {
    const copy = await deployCopy(options.pr, options.artifact, record);

    return {
      attempt: {
        n,
        outcome: "clean",
        route: null,
        status: null,
        requestId: null,
        exceptionLogged: null,
      },
      record: copy.record,
    };
  } catch (error) {
    const found =
      error instanceof Error
        ? classify(error)
        : { outcome: "other" as const, route: null, status: null };

    const log =
      found.outcome === "app-500" || found.outcome === "edge-failure"
        ? await exceptionLog(options.pr, started)
        : { requestId: null, exceptionLogged: null };

    return { attempt: { n, ...found, ...log }, record };
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
  const pull = await pullRequest(options.pr);
  const stale = staleReason({ pr: options.pr, headSha: options.head }, pull);

  if (stale !== null) throw new Error(stale);

  if (!pull.draft) {
    throw new Error(
      `pull request ${String(options.pr)} is not a draft; only a throwaway draft is rebuilt`,
    );
  }

  const attempts = await rebuildFrom(
    options,
    1,
    await lastRecord(options.pr),
    [],
    Date.now() + DEADLINE_MS,
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
