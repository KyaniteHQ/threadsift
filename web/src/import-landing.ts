import type { ImportState } from "../../src/core/contract/import-contract.ts";
import { doneOf } from "../../src/core/contract/import-list.ts";
import { readImportState } from "./import-api.ts";
import { pause } from "./pause.ts";
import { POLL_MS } from "./poll-interval.ts";
import { IMPORT_BATCH_PATIENCE_MS } from "./write-deadlines.ts";

export type Landing = "landed" | "stopped" | "lost" | "unreachable";

export interface Attempt {
  readonly name: string;
  readonly through: number;
  readonly before: Readonly<ImportState> | null;
}

const CURSOR_READ_FAILURES_MAX = 3;

function landedIn(state: Readonly<ImportState> | null, { through, before }: Readonly<Attempt>) {
  return (
    state !== null &&
    doneOf(state.cursor) >= through &&
    (before === null || state.updatedAt > before.updatedAt)
  );
}

type Check = "landed" | "waiting" | "failed";

async function checkOnce(attempt: Readonly<Attempt>, signal?: AbortSignal): Promise<Check> {
  try {
    const state = await readImportState(attempt.name, signal);

    return landedIn(state, attempt) ? "landed" : "waiting";
  } catch {
    return "failed";
  }
}

async function checkThenPause(attempt: Readonly<Attempt>, signal: AbortSignal): Promise<Check> {
  const check = await checkOnce(attempt, signal);

  if (check !== "landed") await pause(POLL_MS, signal);

  return check;
}

async function lastLanding(attempt: Readonly<Attempt>, reason: Landing): Promise<Landing> {
  return (await checkOnce(attempt)) === "landed" ? "landed" : reason;
}

export async function batchLanding(
  attempt: Readonly<Attempt>,
  signal: AbortSignal,
): Promise<Landing> {
  const giveUpAt = Date.now() + IMPORT_BATCH_PATIENCE_MS;
  let failures = 0;

  while (!signal.aborted && Date.now() < giveUpAt) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each read of the saved cursor follows the pause after the one before.
    const check = await checkThenPause(attempt, signal);

    if (check === "landed") return "landed";

    failures = check === "failed" ? failures + 1 : 0;

    if (failures >= CURSOR_READ_FAILURES_MAX && !signal.aborted) {
      return lastLanding(attempt, "unreachable");
    }
  }

  return lastLanding(attempt, signal.aborted ? "stopped" : "lost");
}
