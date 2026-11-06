import { type TestInfo, expect } from "@playwright/test";
import { z } from "zod";

import { attachJson } from "./card.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { jobsOf, makeJobDue, sweepNow } from "./ingest.ts";

const AI_WAIT = 660_000;

const Tasks = z.array(
  z.object({
    id: z.number(),
    state: z.string(),
    refusal: z.string().nullable(),
    inputs: z.string(),
  }),
);

const Observations = z.array(
  z.object({
    requeues: z.number(),
    attempts: z.number(),
    nextAt: z.number(),
    startedAt: z.number(),
  }),
);

function observations(screen: FreshScreen) {
  return screen.fresh.query(
    "SELECT requeues, attempts, next_at AS nextAt, started_at AS startedAt FROM stale_observations ORDER BY requeues",
    Observations,
  );
}

function installChurn(screen: FreshScreen, id: number): void {
  screen.fresh
    .sql(`CREATE TABLE stale_observations(requeues INTEGER, attempts INTEGER, next_at INTEGER, started_at INTEGER);
    CREATE TRIGGER move_catalog AFTER INSERT ON ai_tasks WHEN NEW.executor <> 'caller' BEGIN
      INSERT INTO catalog_version(id, version) VALUES(1, 0) ON CONFLICT(id) DO NOTHING;
      INSERT INTO tags(key, name) VALUES('race ' || NEW.id, 'Race ' || NEW.id);
      UPDATE catalog_version SET version = version + 1 WHERE id = 1;
    END;
    CREATE TRIGGER observe_stale AFTER UPDATE ON jobs WHEN NEW.item_id = ${id} AND NEW.kind = 'digest' AND OLD.state = 'running' AND NEW.state = 'queued' AND NEW.stale_requeues > 0 BEGIN
      INSERT INTO stale_observations SELECT NEW.stale_requeues, NEW.attempts, NEW.next_attempt_at, deadline - 600000 FROM ai_tasks ORDER BY id DESC LIMIT 1;
      UPDATE jobs SET next_attempt_at = 9007199254740991 WHERE id = NEW.id;
    END`);
}

async function assertPublished(
  screen: FreshScreen,
  id: number,
  previous: number,
  info: TestInfo,
): Promise<void> {
  const rows = observations(screen);
  const delayed = rows[2];
  expect((delayed?.nextAt ?? 0) - (delayed?.startedAt ?? 0)).toBeGreaterThanOrEqual(30_000);

  const tasks = screen.fresh.query(
    `SELECT id, state, refusal, inputs FROM ai_tasks WHERE id > ${previous} ORDER BY id`,
    Tasks,
  );

  expect(tasks.map(({ state, refusal }) => ({ state, refusal }))).toEqual([
    { state: "failed", refusal: "stale" },
    { state: "failed", refusal: "stale" },
    { state: "failed", refusal: "stale" },
    { state: "done", refusal: null },
  ]);
  const lists = z.object({ topics: z.array(z.string()), tags: z.array(z.string()) });
  const second = lists.parse(JSON.parse(tasks[1]?.inputs.split("\n")[0] ?? "null"));
  expect(second.tags).toContain(`Race ${tasks[0]?.id ?? 0}`);
  expect(
    screen.fresh.query(
      `SELECT attempts, stale_requeues AS requeues FROM jobs WHERE item_id = ${id} AND kind = 'digest' ORDER BY id DESC LIMIT 1`,
      z.array(z.object({ attempts: z.number(), requeues: z.number() })),
    ),
  ).toEqual([{ attempts: 0, requeues: 0 }]);
  await attachJson(
    info,
    "ordered-stale-catalog.json",
    JSON.stringify({
      rows,
      tasks: tasks.map(({ id: taskId, state, refusal }) => ({ taskId, state, refusal })),
      second,
    }),
  );
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

    for (const expected of [1, 2, 3]) {
      await expect.poll(() => observations(screen).length, { timeout: AI_WAIT }).toBe(expected);
      const rows = observations(screen);
      expect(rows.at(-1)).toMatchObject({ requeues: expected, attempts: 0 });

      const task = screen.fresh
        .query(
          `SELECT id, state, refusal, inputs FROM ai_tasks WHERE id > ${previous} ORDER BY id`,
          Tasks,
        )
        .at(-1);

      expect(task).toMatchObject({ state: "failed", refusal: "stale" });
      const job = jobsOf(id, screen.fresh, "digest").at(-1);

      if (job === undefined) throw new Error("No stale Digest job");
      expect(job).toMatchObject({ state: "queued", attempts: 0 });
      makeJobDue(job.id, screen.fresh);
      await sweepNow(screen.context.request, screen.fresh);
    }

    await expect
      .poll(() => jobsOf(id, screen.fresh, "digest").at(-1)?.state, { timeout: AI_WAIT })
      .toBe("done");
    await assertPublished(screen, id, previous, info);
  } finally {
    screen.fresh.sql("DROP TRIGGER move_catalog; DROP TRIGGER observe_stale");
  }
}
