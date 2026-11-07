import { type TestInfo, expect } from "@playwright/test";
import { z } from "zod";

import { attachJson } from "./card.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { jobsOf, makeJobDue, sweepNow } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

const AI_WAIT = 660_000;
const STALE_CAP = 3;
const MAX_RETRYABLE_FAILURES = 2;
const MAX_STALE_REQUEUES_SEEN = STALE_CAP * (MAX_RETRYABLE_FAILURES + 1);
const RETRYABLE_REFUSALS = new Set(["unreachable", "timeout", "provider-busy"]);

const Tasks = z.array(
  z.object({
    id: z.number(),
    state: z.string(),
    refusal: z.string().nullable(),
    status: z.number().nullable(),
    attempts: z.number(),
    inputs: z.string(),
  }),
);

type Task = z.infer<typeof Tasks>[number];

const Observations = z.array(
  z.object({
    requeues: z.number(),
    attempts: z.number(),
    claimed: z.number(),
    nextAt: z.number(),
    startedAt: z.number(),
  }),
);

function observations(screen: FreshScreen) {
  return screen.fresh.query(
    "SELECT requeues, attempts, claimed, next_at AS nextAt, started_at AS startedAt FROM stale_observations ORDER BY rowid",
    Observations,
  );
}

function tasksSince(screen: FreshScreen, previous: number) {
  return screen.fresh.query(
    `SELECT id, state, refusal, status, attempts, inputs FROM ai_tasks WHERE id > ${previous} ORDER BY id`,
    Tasks,
  );
}

function retriesProvider({ state, refusal, status }: Readonly<Task>): boolean {
  if (state !== "failed") return false;

  if (refusal === "no-json") return status === null || (status >= 200 && status < 300);

  return refusal !== null && RETRYABLE_REFUSALS.has(refusal);
}

function installChurn(screen: FreshScreen, id: number): void {
  screen.fresh
    .sql(`CREATE TABLE stale_observations(requeues INTEGER, attempts INTEGER, claimed INTEGER, next_at INTEGER, started_at INTEGER);
    CREATE TRIGGER move_catalog AFTER INSERT ON ai_tasks WHEN NEW.executor <> 'caller' BEGIN
      INSERT INTO catalog_version(id, version) VALUES(1, 0) ON CONFLICT(id) DO NOTHING;
      INSERT INTO tags(key, name) VALUES('race ' || NEW.id, 'Race ' || NEW.id);
      UPDATE catalog_version SET version = version + 1 WHERE id = 1;
    END;
    CREATE TRIGGER observe_stale AFTER UPDATE ON jobs WHEN NEW.item_id = ${id} AND NEW.kind = 'digest' AND OLD.state = 'running' AND NEW.state = 'queued' AND NEW.stale_requeues > 0 BEGIN
      INSERT INTO stale_observations SELECT NEW.stale_requeues, NEW.attempts, attempts - 1, NEW.next_attempt_at, deadline - 600000 FROM ai_tasks ORDER BY id DESC LIMIT 1;
      UPDATE jobs SET next_attempt_at = 9007199254740991 WHERE id = NEW.id;
    END`);
}

function expectedObservations(tasks: readonly Task[]) {
  const expected: { requeues: number; attempts: number; claimed: number }[] = [];
  let claimed = 0;
  let stale = 0;
  let failures = 0;

  for (const task of tasks) {
    expect(task.attempts, `task ${task.id} claims the attempt after ${claimed}`).toBe(claimed + 1);

    if (task.state === "done") {
      expect(task, "the done task closes the sequence").toBe(tasks.at(-1));
      expect(stale, "publication follows the cap of consecutive stale requeues").toBe(STALE_CAP);
    } else if (task.state === "failed" && task.refusal === "stale") {
      stale += 1;
      expected.push({ requeues: stale, attempts: claimed, claimed });
    } else {
      expect(
        retriesProvider(task),
        `task ${task.id} ended ${task.state} with ${task.refusal ?? "no refusal"}`,
      ).toBe(true);
      failures += 1;
      claimed += 1;
      stale = 0;
    }
  }

  expect(tasks.at(-1)?.state, "the last task is the published one").toBe("done");
  expect(failures, "retryable Provider failures stay below the attempt cap").toBeLessThanOrEqual(
    MAX_RETRYABLE_FAILURES,
  );

  return expected;
}

async function assertPublished(
  screen: FreshScreen,
  id: number,
  previous: number,
  info: TestInfo,
): Promise<void> {
  const rows = observations(screen);
  const tasks = tasksSince(screen, previous);

  expect(rows.map(({ requeues, attempts, claimed }) => ({ requeues, attempts, claimed }))).toEqual(
    expectedObservations(tasks),
  );

  const delayed = rows.at(-1);
  expect(delayed?.requeues).toBe(STALE_CAP);
  expect((delayed?.nextAt ?? 0) - (delayed?.startedAt ?? 0)).toBeGreaterThanOrEqual(30_000);

  const lists = z.object({ topics: z.array(z.string()), tags: z.array(z.string()) });
  const second = lists.parse(JSON.parse(tasks[1]?.inputs.split("\n")[0] ?? "null"));
  expect(second.tags).toContain(`Race ${tasks[0]?.id ?? 0}`);
  expect(
    screen.fresh.query(
      `SELECT attempts, stale_requeues AS requeues FROM jobs WHERE item_id = ${id} AND kind = 'digest' ORDER BY id DESC LIMIT 1`,
      z.array(z.object({ attempts: z.number(), requeues: z.number() })),
    ),
  ).toEqual([{ attempts: (tasks.at(-1)?.attempts ?? 0) - 1, requeues: 0 }]);
  await attachJson(
    info,
    "ordered-stale-catalog.json",
    JSON.stringify({
      rows,
      tasks: tasks.map(({ id: taskId, state, refusal, status, attempts }) => ({
        taskId,
        state,
        refusal,
        status,
        attempts,
      })),
      second,
    }),
  );
}

type Outcome = "observed" | "done" | "waiting";

function outcomeOf(screen: FreshScreen, id: number, handled: number): Outcome {
  if (observations(screen).length > handled) return "observed";

  return jobsOf(id, screen.fresh, "digest").at(-1)?.state === "done" ? "done" : "waiting";
}

export async function proveStaleCatalog(
  screen: FreshScreen,
  id: number,
  start: () => Promise<void>,
  info: TestInfo,
): Promise<void> {
  const previous =
    screen.fresh.query(
      "SELECT coalesce(max(id), 0) AS id FROM ai_tasks",
      z.array(z.object({ id: z.number() })),
    )[0]?.id ?? 0;

  installChurn(screen, id);

  try {
    await start();

    for (let handled = 0; handled < MAX_STALE_REQUEUES_SEEN; handled += 1) {
      await expect
        .poll(() => outcomeOf(screen, id, handled), { timeout: AI_WAIT })
        .not.toBe("waiting");

      const observed = observations(screen)[handled];

      if (observed === undefined) break;
      expect(observed.attempts, "a stale requeue leaves the attempts the run claimed").toBe(
        observed.claimed,
      );

      expect(tasksSince(screen, previous).at(-1)).toMatchObject({
        state: "failed",
        refusal: "stale",
      });
      const job = jobsOf(id, screen.fresh, "digest").at(-1);

      if (job === undefined) throw new Error("No stale Digest job");
      expect(job).toMatchObject({ state: "queued", attempts: observed.claimed });
      makeJobDue(job.id, screen.fresh);

      if (!isContainerTarget()) await sweepNow(screen.context.request, screen.fresh);
    }

    await expect
      .poll(() => jobsOf(id, screen.fresh, "digest").at(-1)?.state, { timeout: AI_WAIT })
      .toBe("done");
    await assertPublished(screen, id, previous, info);
  } finally {
    screen.fresh.sql("DROP TRIGGER move_catalog; DROP TRIGGER observe_stale");
  }
}
