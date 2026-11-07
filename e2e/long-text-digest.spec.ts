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
});
