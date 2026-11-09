import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { type Instance, launchFresh, newCode } from "./access.ts";
import { ownerOf, storeFileItem, storeJob } from "./files.ts";
import { releaseSweepThrottle } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

const TICK_WAIT_MS = 150_000;

const REFUSED_ADDRESS = "http://127.0.0.1/sweep-stages";

let instance: Instance;
let owner: APIRequestContext;

test.beforeEach(async () => {
  const code = newCode();
  instance = launchFresh(code);
  owner = await ownerOf(instance, code, "c".repeat(20));
});

test.afterEach(async () => {
  await owner.dispose();
  instance.stop();
});

const JobStates = z.array(z.object({ state: z.string() }));

function dueFetch(): number {
  const id = storeFileItem(instance, { url: REFUSED_ADDRESS, title: "Waiting" });

  instance.sql(`UPDATE items SET status = 'processing' WHERE id = ${id}`);
  instance.sql(
    `INSERT INTO jobs (kind, item_id, address, state, attempts, next_attempt_at) VALUES ('fetch', ${id}, '${REFUSED_ADDRESS}', 'queued', 0, 0)`,
  );

  return id;
}

function strayFile(): string {
  const url = "https://example.com/sweep-stages-stray";
  const id = storeFileItem(instance, { url, title: "Seeded" });
  const job = storeJob(instance, id, url, "done");
  const key = `items/${id}/post-${job}-1.md`;

  instance.writeFile(key, Buffer.from("a file that nothing names"));

  return key;
}

function jobStates(id: number): string[] {
  return instance
    .query(`SELECT state FROM jobs WHERE item_id = ${id}`, JobStates)
    .map(({ state }) => state);
}

test("a sweep whose search stage fails still re-queues the due job and cleans the files, and logs the failed stage", async () => {
  test.setTimeout(TICK_WAIT_MS + 90_000);
  const stray = strayFile();
  const id = dueFetch();

  instance.sql(
    "CREATE TRIGGER sweep_stage_fails BEFORE INSERT ON search_reconciling BEGIN SELECT RAISE(ABORT, 'the search stage fails'); END",
  );

  await expect
    .poll(
      async () => {
        if (!isContainerTarget()) {
          releaseSweepThrottle(instance);
          expect((await owner.get("/cdn-cgi/local/scheduled")).status()).toBe(500);
        }

        return {
          stray: instance.listFiles("items/").some(({ key }) => key === stray),
          jobs: jobStates(id),
        };
      },
      { timeout: TICK_WAIT_MS, intervals: [2000] },
    )
    .toEqual({ stray: false, jobs: ["done"] });

  expect(instance.logs()).toContain('"event":"sweep-stage-failed","stage":"search"');
});
