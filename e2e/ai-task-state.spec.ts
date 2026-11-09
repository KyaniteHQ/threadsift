import { expect, test } from "@playwright/test";
import { z } from "zod";

import { aiScreen, newSealingKey } from "./ai.ts";
import { SENT_DIGEST } from "./catalog.ts";
import { configureDigest } from "./digest.ts";
import { storeFileItem } from "./files.ts";
import { deferJobs, jobsOf, makeJobDue, sweepNow } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

const WAIT = 120_000;

test.use({ trace: "off", video: "off", screenshot: "off" });

let screen: Awaited<ReturnType<typeof aiScreen>>;

test.afterEach(async () => {
  await screen?.close();
});

const Tasks = z.array(
  z.object({ executor: z.string(), state: z.string(), refusal: z.string().nullable() }),
);

function tasks() {
  return screen.fresh.query("SELECT executor, state, refusal FROM ai_tasks ORDER BY id", Tasks);
}

async function sentDigestItem() {
  const id = storeFileItem(screen.fresh, {
    url: "https://example.com/expired-task",
    title: "Expired task",
    postText: "A short essay about harbour logistics, long enough to be digested.",
  });

  screen.fresh.sql(
    `UPDATE items SET pending_digest = '${JSON.stringify(SENT_DIGEST)}' WHERE id = ${id}`,
  );

  const release = deferJobs(screen.fresh, "digest");

  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "task-state-proof",
  });
  screen.fresh.sql(
    "CREATE TRIGGER expire_first_task AFTER INSERT ON ai_tasks WHEN (SELECT count(*) FROM ai_tasks) = 1 BEGIN UPDATE ai_tasks SET state = 'failed', refusal = 'timeout' WHERE id = NEW.id; END",
  );

  release();

  return id;
}

test("an AI task that expired before its Digest was published stays failed, and the Digest is published by a later attempt with its own task", async ({
  browser,
}) => {
  test.setTimeout(WAIT * 2);
  screen = await aiScreen(browser, newSealingKey());

  const id = await sentDigestItem();

  const [job] = jobsOf(id, screen.fresh, "digest");

  expect(job).toBeDefined();
  makeJobDue(job?.id ?? 0, screen.fresh);

  await expect
    .poll(
      async () => {
        if (!isContainerTarget()) await sweepNow(screen.context.request, screen.fresh);

        return jobsOf(id, screen.fresh, "digest").map((row) => row.state);
      },
      { timeout: WAIT },
    )
    .toEqual(["done"]);

  expect(tasks()).toEqual([
    { executor: "caller", state: "failed", refusal: "timeout" },
    { executor: "caller", state: "done", refusal: null },
  ]);

  expect(
    screen.fresh.query(
      `SELECT t.state FROM digests d JOIN ai_tasks t ON t.id = d.task_id WHERE d.item_id = ${id}`,
      z.array(z.object({ state: z.string() })),
    ),
  ).toEqual([{ state: "done" }]);
});
