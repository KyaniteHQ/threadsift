import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { hasAiCredentials, aiScreen, countRows, newSealingKey, proofProvider } from "./ai.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { WAR_AND_PEACE } from "./articles.ts";
import { configureDigest, digestRecord } from "./digest.ts";
import { nameFile, storeFileItem } from "./files.ts";
import { jobsOf, makeJobDue, sweepNow } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

const AI_WAIT = 660_000;

const DIGEST_CAP_BYTES = 14_000;

const START_CHARS = 80;

const EMPTY_LISTS_BYTES = 23;

const EARLY_MARKER = "EARLY-MARKER-4821";

const MIDDLE_MARKER = "MIDDLE-MARKER-7305";

const AFTER_CUT_MARKER = "AFTER-CUT-MARKER-1066";

const LATE_MARKER = "LATE-MARKER-9917";

const SEEDED_TITLE = "Seeded";

const STALE_CHECK_KEY = "stale-check";

test.use({ trace: "off", video: "off", screenshot: "off" });

let screen: Awaited<ReturnType<typeof aiScreen>>;

test.afterEach(async () => {
  await screen?.close();
});

async function dueAgainAfterAttempt(
  request: APIRequestContext,
  id: number,
  attempts: number,
): Promise<void> {
  await expect
    .poll(() => jobsOf(id, screen.fresh, "digest")[0]?.attempts, { timeout: 60_000 })
    .toBe(attempts);
  expect(jobsOf(id, screen.fresh, "digest")[0]?.state).toBe("queued");
  makeJobDue(jobsOf(id, screen.fresh, "digest")[0]?.id ?? 0, screen.fresh);
  await sweepNow(request, screen.fresh);
}

const Inputs = z.array(z.object({ bytes: z.number(), inputs: z.string() }));

function filler(bytes: number): string {
  return "harbour logistics report ".repeat(Math.ceil(bytes / 25)).slice(0, bytes);
}

function textStraddlingTheCut(): string {
  const open = JSON.stringify({ title: SEEDED_TITLE, source: "article", postText: "" });
  const prefix = Buffer.byteLength(open) - 2;
  const budget = DIGEST_CAP_BYTES - EMPTY_LISTS_BYTES - 1 - prefix;
  const kept = budget - 2;
  const head = `${EARLY_MARKER} ${filler(budget / 2)} ${MIDDLE_MARKER} `;

  return `${head}${filler(kept - head.length)}😀 ${AFTER_CUT_MARKER} ${filler(15_000)} ${LATE_MARKER}`;
}

test("War and Peace, pasted with the real Provider saved, gets a Digest from the start of its file", async ({
  browser,
}) => {
  test.skip(!isContainerTarget(), "the Worker never reads a text over 1,000,000 bytes");
  test.skip(
    !hasAiCredentials() && process.env["THREADSIFT_AI_REQUIRED"] !== "true",
    "Workers AI credentials unavailable; the real Digest proof is skipped on fork pull requests.",
  );
  test.setTimeout(AI_WAIT + 240_000);
  expect(hasAiCredentials()).toBe(true);
  screen = await aiScreen(browser, newSealingKey());
  await configureDigest(screen, proofProvider());

  const { body } = await postLinkRaw(screen.context.request, WAR_AND_PEACE);
  const id = body.item.id;

  await expect
    .poll(() => digestRecord(screen, id).length, { timeout: AI_WAIT, intervals: [2000] })
    .toBe(1);

  const item = await settled(screen.context.request, id);
  const [record] = digestRecord(screen, id);

  expect(item).toMatchObject({ status: "ready", digestOutcome: "none", fetch: "ok" });
  expect(Buffer.byteLength(item.postText ?? "")).toBeGreaterThan(1_000_000);
  expect(record?.state).toBe("done");
  expect(record?.digest.summary.trim().length ?? 0).toBeGreaterThan(0);

  const [task] = screen.fresh.query(
    "SELECT length(CAST(inputs AS BLOB)) AS bytes, inputs FROM ai_tasks WHERE kind = 'digest'",
    Inputs,
  );

  const start = JSON.stringify((item.postText ?? "").slice(0, START_CHARS)).slice(1, -1);

  expect(task?.bytes ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(DIGEST_CAP_BYTES);
  expect(task?.inputs, "the model input starts with the start of the file").toContain(start);
});

test("a long text whose file is missing ends the Digest as failed after three attempts, with no Provider call", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  screen = await aiScreen(browser, newSealingKey());
  const request = screen.context.request;

  const id = storeFileItem(screen.fresh, {
    url: "https://example.com/missing-file",
    title: "Seeded",
  });

  nameFile(screen.fresh, id, `'items/${id}/gone.md'`);
  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "missing-file-proof",
  });

  await sweepNow(request, screen.fresh);
  await dueAgainAfterAttempt(request, id, 1);
  await dueAgainAfterAttempt(request, id, 2);

  expect(await settled(request, id)).toMatchObject({
    status: "ready",
    digestOutcome: "failed",
    digestTitle: null,
    postText: null,
  });
  expect(jobsOf(id, screen.fresh, "digest")).toMatchObject([{ state: "done", attempts: 3 }]);
  expect(countRows(screen, "ai_tasks"), "Provider calls").toBe(0);
  expect(screen.fresh.logs()).toContain(
    `"event":"post-text-unavailable","itemId":${id},"reason":"missing"`,
  );
  expect((await itemOf(request, id)).postText).toBeNull();

  const jobId = jobsOf(id, screen.fresh, "digest")[0]?.id ?? 0;
  const logs = screen.fresh.logs();

  expect(logs).toContain(
    `"event":"job-attempt-failed","jobId":${jobId},"kind":"digest","attempt":1,"error":"PostTextUnreadable"`,
  );
  expect(logs, "a failed attempt logs the error class and no error text").not.toContain(
    "cannot be read",
  );
});

test("a seeded long text in the store gets a Digest from its first 14,000 bytes of input, cut before a character the cut splits", async ({
  browser,
}) => {
  test.skip(
    !hasAiCredentials() && process.env["THREADSIFT_AI_REQUIRED"] !== "true",
    "Workers AI credentials unavailable; the real Digest proof is skipped on fork pull requests.",
  );
  test.setTimeout(AI_WAIT + 240_000);
  expect(hasAiCredentials()).toBe(true);
  screen = await aiScreen(browser, newSealingKey());

  const text = textStraddlingTheCut();

  const id = storeFileItem(screen.fresh, {
    url: "https://example.com/seeded-long",
    title: SEEDED_TITLE,
  });

  const key = `items/${id}/seeded.md`;

  nameFile(screen.fresh, id, `'${key}'`);
  screen.fresh.writeFile(key, Buffer.from(text));
  await configureDigest(screen, proofProvider());
  await sweepNow(screen.context.request, screen.fresh);

  await expect
    .poll(() => digestRecord(screen, id).length, { timeout: AI_WAIT, intervals: [2000] })
    .toBe(1);

  const [record] = digestRecord(screen, id);

  const [task] = screen.fresh.query(
    "SELECT length(CAST(inputs AS BLOB)) AS bytes, inputs FROM ai_tasks WHERE kind = 'digest'",
    Inputs,
  );

  expect(Buffer.byteLength(text)).toBeGreaterThan(2 * DIGEST_CAP_BYTES);
  expect(record?.state).toBe("done");
  expect(record?.digest.summary.trim().length ?? 0).toBeGreaterThan(0);
  expect(task?.inputs).toContain(EARLY_MARKER);
  expect(task?.inputs).toContain(MIDDLE_MARKER);
  expect(task?.inputs).not.toContain(AFTER_CUT_MARKER);
  expect(task?.inputs).not.toContain(LATE_MARKER);
  expect(task?.inputs).not.toContain("😀");
  expect(task?.inputs, "no replacement character at the cut").not.toContain("\uFFFD");
  expect(task?.bytes, "the input ends before the character the cut split").toBe(
    DIGEST_CAP_BYTES - 2,
  );
});

const DigestJobRows = z.array(
  z.object({
    state: z.string(),
    attempts: z.number(),
    staleRequeues: z.number(),
    failed: z.number(),
  }),
);

function digestJobRow() {
  return screen.fresh.query(
    "SELECT j.state AS state, j.attempts AS attempts, j.stale_requeues AS staleRequeues, i.digest_failed AS failed FROM jobs j JOIN items i ON i.id = j.item_id WHERE j.kind = 'digest'",
    DigestJobRows,
  )[0];
}

test("a Digest that cannot read its file while a fetch is open on the Item is requeued without counting an attempt or failing the Item", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  screen = await aiScreen(browser, newSealingKey());
  const request = screen.context.request;
  const url = "https://example.com/stale-check";

  screen.fresh.sql(
    `CREATE TRIGGER fetch_after_digest_claim AFTER UPDATE ON jobs WHEN NEW.kind = 'digest' AND NEW.state = 'running' BEGIN INSERT INTO jobs (kind, item_id, address, state, attempts, next_attempt_at) VALUES ('fetch', NEW.item_id, '${url}', 'queued', 0, 9007199254740991); END`,
  );

  const id = storeFileItem(screen.fresh, { url, title: SEEDED_TITLE });

  nameFile(screen.fresh, id, `'items/${id}/${STALE_CHECK_KEY}.md'`);
  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "stale-check-proof",
  });
  await sweepNow(request, screen.fresh);

  await expect.poll(() => digestJobRow()?.staleRequeues, { timeout: 90_000 }).toBe(1);
  expect(digestJobRow()).toEqual({ state: "queued", attempts: 0, staleRequeues: 1, failed: 0 });
  expect(countRows(screen, "ai_tasks"), "Provider calls").toBe(0);

  screen.fresh.sql(
    `DROP TRIGGER fetch_after_digest_claim; DELETE FROM jobs WHERE kind = 'fetch' AND item_id = ${id}`,
  );
  makeJobDue(jobsOf(id, screen.fresh, "digest")[0]?.id ?? 0, screen.fresh);
  await sweepNow(request, screen.fresh);
  await expect.poll(() => digestJobRow()?.attempts, { timeout: 90_000 }).toBe(1);
  expect(digestJobRow()?.failed, "a read that fails on current inputs is a counted failure").toBe(
    0,
  );
});
