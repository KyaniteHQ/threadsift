import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { type Instance, launchFresh, newCode } from "./access.ts";
import { ownerOf, storeFileItem, storeJob, TICK_WAIT_MS } from "./files.ts";
import { runSweep } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

const HOUR_MS = 3_600_000;

const LastRun = z.array(z.object({ last_run_at: z.number() }));

let instance: Instance;
let owner: APIRequestContext;

test.beforeEach(async () => {
  const code = newCode();
  instance = launchFresh(code);
  owner = await ownerOf(instance, code, "k".repeat(20));
});

test.afterEach(async () => {
  await owner.dispose();
  instance.stop();
});

test("a sweep still runs after the clock moved back an hour behind the time the last sweep stored", async () => {
  test.setTimeout(TICK_WAIT_MS + 90_000);

  const url = "https://example.com/sweep-clock";
  const id = storeFileItem(instance, { url, title: "Seeded" });
  const job = storeJob(instance, id, url, "done");
  const stray = `items/${id}/post-${job + 100}-1.md`;

  instance.writeFile(stray, Buffer.from("a file that nothing can publish"));
  expect(instance.listFiles("items/").map(({ key }) => key)).toEqual([stray]);

  instance.sql(
    `INSERT INTO scheduled_runs (task, last_run_at) VALUES ('sweep', ${Date.now() + HOUR_MS}) ON CONFLICT (task) DO UPDATE SET last_run_at = ${Date.now() + HOUR_MS}`,
  );

  await expect
    .poll(
      async () => {
        if (!isContainerTarget()) await runSweep(owner);

        return instance.listFiles("items/").map(({ key }) => key);
      },
      { timeout: TICK_WAIT_MS, intervals: [2000] },
    )
    .toEqual([]);

  const [{ last_run_at: lastRunAt } = { last_run_at: Infinity }] = instance.query(
    "SELECT last_run_at FROM scheduled_runs WHERE task = 'sweep'",
    LastRun,
  );

  expect(lastRunAt).toBeLessThan(Date.now() + HOUR_MS / 2);
});
