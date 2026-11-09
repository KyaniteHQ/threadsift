import { expect, test } from "@playwright/test";
import { z } from "zod";

import { aiScreen, newSealingKey } from "./ai.ts";
import { SENT_DIGEST } from "./catalog.ts";
import { configureDigest } from "./digest.ts";
import { storeFileItem } from "./files.ts";
import { jobsOf, makeJobDue, sweepNow } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

const WAIT = 120_000;

const TEXT = "A short essay about harbour logistics, long enough to be digested.";

test.use({ trace: "off", video: "off", screenshot: "off" });

let screen: Awaited<ReturnType<typeof aiScreen>>;

test.afterEach(async () => {
  await screen?.close();
});

const Counts = z.array(z.object({ n: z.number() }));

function count(statement: string): number {
  return screen.fresh.query(statement, Counts)[0]?.n ?? -1;
}

function savedText(url: string): number {
  return storeFileItem(screen.fresh, { url, title: "Moved input", postText: TEXT });
}

async function settleDigestJob(itemId: number): Promise<void> {
  await expect
    .poll(
      async () => {
        for (const job of jobsOf(itemId, screen.fresh, "digest")) {
          if (job.state === "queued") makeJobDue(job.id, screen.fresh);
        }

        if (!isContainerTarget()) await sweepNow(screen.context.request, screen.fresh);

        return jobsOf(itemId, screen.fresh, "digest").map((job) => job.state);
      },
      { timeout: WAIT },
    )
    .toEqual(["done"]);
}

test("a caller-sent Digest still owed when its job gives up is published by a new job", async ({
  browser,
}) => {
  test.setTimeout(WAIT * 2);
  screen = await aiScreen(browser, newSealingKey());

  const id = savedText("https://example.com/owed-digest");
  screen.fresh.sql(
    `UPDATE items SET status = 'processing', pending_digest = '${JSON.stringify(SENT_DIGEST)}' WHERE id = ${id}`,
  );
  screen.fresh.sql(
    `INSERT INTO jobs (kind, item_id, address, state, attempts, next_attempt_at) VALUES ('digest', ${id}, 'https://example.com/owed-digest', 'queued', 3, 0)`,
  );
  await expect
    .poll(
      async () => {
        if (!isContainerTarget()) await sweepNow(screen.context.request, screen.fresh);

        return count(`SELECT count(*) AS n FROM digests WHERE item_id = ${id}`);
      },
      { timeout: WAIT },
    )
    .toBe(1);

  expect(
    count(`SELECT count(*) AS n FROM items WHERE id = ${id} AND pending_digest IS NULL`),
    "the pending Digest is published and cleared",
  ).toBe(1);
  expect(count(`SELECT count(*) AS n FROM items WHERE id = ${id} AND status = 'ready'`)).toBe(1);
  expect(jobsOf(id, screen.fresh, "digest").map((job) => job.state)).toEqual(["done", "done"]);
});

test("a last attempt that ends after the Item's content moved starts a full set of attempts on the new content", async ({
  browser,
}) => {
  test.setTimeout(WAIT * 3);
  screen = await aiScreen(browser, newSealingKey());

  const id = savedText("https://example.com/moved-input");

  screen.fresh.sql(
    "CREATE TRIGGER move_input AFTER INSERT ON ai_tasks WHEN (SELECT count(*) FROM ai_tasks) = 3 BEGIN UPDATE items SET generation = generation + 1 WHERE id = NEW.item_id; END",
  );

  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "moved-input-proof",
  });

  await settleDigestJob(id);

  expect(
    count("SELECT count(*) AS n FROM ai_tasks"),
    "three tasks more for the moved content",
  ).toBe(6);
  expect(count(`SELECT count(*) AS n FROM items WHERE id = ${id} AND digest_failed = 1`)).toBe(1);
});

test("a takeover of a crashed attempt on content that moved gets a full set of attempts, and the failure stays final for that content", async ({
  browser,
}) => {
  test.setTimeout(WAIT * 3);
  screen = await aiScreen(browser, newSealingKey());

  const id = savedText("https://example.com/moved-after-crash");

  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "moved-after-crash-proof",
  });

  await expect
    .poll(
      async () => {
        for (const job of jobsOf(id, screen.fresh, "digest")) {
          if (job.state === "queued" && job.attempts < 2) makeJobDue(job.id, screen.fresh);
        }

        if (!isContainerTarget()) await sweepNow(screen.context.request, screen.fresh);

        return jobsOf(id, screen.fresh, "digest").map((job) => `${job.state} ${job.attempts}`);
      },
      { timeout: WAIT },
    )
    .toEqual(["queued 2"]);

  expect(count("SELECT count(*) AS n FROM ai_tasks"), "two attempts on the first content").toBe(2);

  screen.fresh.sql(`UPDATE items SET generation = generation + 1 WHERE id = ${id}`);
  screen.fresh.sql("UPDATE jobs SET state = 'running', claim_expires = 1 WHERE kind = 'digest'");

  await settleDigestJob(id);

  expect(count("SELECT count(*) AS n FROM ai_tasks"), "three attempts on the moved content").toBe(
    5,
  );
  expect(count(`SELECT count(*) AS n FROM items WHERE id = ${id} AND digest_failed = 1`)).toBe(1);
  expect(jobsOf(id, screen.fresh, "digest").map((job) => job.state)).toEqual(["done"]);
});

test("a job whose attempts ran out is not closed when the content moves inside its claim, and the new content gets its own attempts", async ({
  browser,
}) => {
  test.setTimeout(WAIT * 3);
  screen = await aiScreen(browser, newSealingKey());

  const id = savedText("https://example.com/moved-inside-claim");

  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "moved-inside-claim-proof",
  });

  await expect
    .poll(
      async () => {
        for (const job of jobsOf(id, screen.fresh, "digest")) {
          if (job.state === "queued" && job.attempts < 2) makeJobDue(job.id, screen.fresh);
        }

        if (!isContainerTarget()) await sweepNow(screen.context.request, screen.fresh);

        return jobsOf(id, screen.fresh, "digest").map((job) => `${job.state} ${job.attempts}`);
      },
      { timeout: WAIT },
    )
    .toEqual(["queued 2"]);

  screen.fresh.sql(
    "CREATE TRIGGER move_in_claim AFTER UPDATE OF state ON jobs WHEN NEW.kind = 'digest' AND NEW.state = 'running' AND NEW.attempts = 3 BEGIN UPDATE items SET generation = generation + 1 WHERE id = NEW.item_id; END",
  );
  screen.fresh.sql("UPDATE jobs SET state = 'running', claim_expires = 1 WHERE kind = 'digest'");

  await settleDigestJob(id);

  expect(count("SELECT count(*) AS n FROM ai_tasks"), "three attempts on the moved content").toBe(
    5,
  );
  expect(count(`SELECT count(*) AS n FROM items WHERE id = ${id} AND digest_failed = 1`)).toBe(1);
});
