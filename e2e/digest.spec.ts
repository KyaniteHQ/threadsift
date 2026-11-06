import { type TestInfo, expect, test } from "@playwright/test";
import { z } from "zod";

import { DigestSchema } from "../src/core/ai-contract.ts";
import { ItemResponseSchema } from "../src/http/schemas.ts";
import { RETRY_LABEL } from "../web/src/text.ts";
import { aiJson, aiScreen, newSealingKey, proofProvider } from "./ai.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import {
  unchangedOpenDigest,
  configureDigest,
  digestJobs,
  digestRecord,
  digestScreens,
  makeDigestDue,
  stuckDigestItems,
} from "./digest.ts";
import type { FreshScreen } from "./fresh-screen.ts";

const NO_DIGEST = "No Digest";
const AI_WAIT = 660_000;

const hasCredentials =
  (process.env["CLOUDFLARE_WORKERS_AI_TOKEN"] ?? "") !== "" &&
  (process.env["CLOUDFLARE_ACCOUNT_ID"] ?? "") !== "";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 900_000 });

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

test("Digests skip unconfigured and textless Items, retry network failures on stored deadlines, then settle", async ({
  browser,
}, info) => {
  screen = await aiScreen(browser, newSealingKey());
  const request = screen.context.request;
  const initial = await postLinkRaw(request, ESSAY);
  const item = await settled(request, initial.body.item.id);
  expect(item.postText?.length).toBeGreaterThan(100);
  expect(digestJobs(screen, item.id)).toEqual([]);
  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "network-proof",
  });
  const textless = await postLinkRaw(request, "https://x.com/threadsift/status/12345");
  await settled(request, textless.body.item.id);
  expect(digestJobs(screen, textless.body.item.id)).toEqual([]);
  expect(digestJobs(screen, item.id)).toEqual([]);
  await postLinkRaw(request, ESSAY);
  await expect.poll(() => digestJobs(screen, item.id)[0]?.attempts).toBe(1);
  const first = digestJobs(screen, item.id)[0];
  expect(first?.state).toBe("queued");
  expect((await itemOf(request, item.id)).status).toBe("processing");
  await assertDelay(1, 30_000, item.id, info);
  await unchangedOpenDigest(screen, item.id);

  if (first === undefined) throw new Error("no Digest job");
  await makeDigestDue(screen, first.id);
  await expect.poll(() => digestJobs(screen, item.id)[0]?.attempts).toBe(2);
  await assertDelay(2, 120_000, item.id, info);
  await makeDigestDue(screen, first.id);
  const end = await settled(request, item.id);
  expect(end).toMatchObject({
    status: "ready",
    reason: null,
    digestTitle: null,
    digestTopic: null,
    digestOutcome: "failed",
  });
  expect(digestJobs(screen, item.id)).toMatchObject([{ state: "done", attempts: 3 }]);
  expect(stuckDigestItems(screen)).toBe(0);
});

async function assertDelay(
  attempts: number,
  delay: number,
  id: number,
  info: TestInfo,
): Promise<void> {
  const [task] = screen.fresh.query(
    "SELECT deadline FROM ai_tasks ORDER BY id DESC LIMIT 1",
    z.array(z.object({ deadline: z.number() })),
  );

  const job = digestJobs(screen, id)[0];
  expect((job?.nextAttemptAt ?? 0) - ((task?.deadline ?? 0) - 600_000)).toBeGreaterThanOrEqual(
    delay,
  );
  await info.attach(`retry-${attempts}`, {
    body: JSON.stringify({ job, task }),
    contentType: "application/json",
  });
}

async function readStored(id: number, provider: Readonly<ReturnType<typeof proofProvider>>) {
  const item = await settled(screen.context.request, id, AI_WAIT);
  const records = digestRecord(screen, id);
  expect(records).toHaveLength(1);
  const record = records[0];
  expect(record).toMatchObject({
    provider: provider.provider,
    model: provider.model,
    generation: item.generation,
    revision: item.generation,
    state: "done",
  });
  const digest = DigestSchema.parse(JSON.parse(record?.digest ?? "null"));
  expect(item).toMatchObject({
    status: "ready",
    reason: null,
    digestOutcome: "none",
    digestTitle: digest.title,
    digestTopic: digest.topic,
  });
  expect(stuckDigestItems(screen)).toBe(0);

  return item;
}

async function rowShows(id: number, title: string, topic: string): Promise<void> {
  await screen.page.goto("/");
  const row = screen.page.locator(`article[data-key='${id}']`);
  await expect(row.locator(".it-title")).toContainText(title);
  await expect(row.locator(".it-topic")).toHaveText(topic);
}

async function retryInBrowser(id: number): Promise<void> {
  await screen.page.goto("/");
  await screen.page
    .locator(`article[data-key='${id}']`)
    .getByRole("button", { name: RETRY_LABEL, exact: true })
    .click();
}

test("wrong keys give up once, Digest-only retry keeps the fetch, refresh replaces the Digest, and failed regeneration keeps it", async ({
  browser,
}, info) => {
  test.skip(
    !hasCredentials && process.env["THREADSIFT_AI_REQUIRED"] !== "true",
    "Workers AI credentials unavailable; the real Digest proof is skipped on fork pull requests.",
  );
  expect(hasCredentials).toBe(true);
  screen = await aiScreen(browser, newSealingKey());
  const provider = proofProvider();
  const wrong = { ...provider, key: process.env["THREADSIFT_WRONG_AI_KEY"] ?? newSealingKey() };
  await configureDigest(screen, wrong);
  const { body } = await postLinkRaw(screen.context.request, ESSAY);
  const failed = await settled(screen.context.request, body.item.id, AI_WAIT);
  expect(failed).toMatchObject({
    status: "ready",
    reason: null,
    digestOutcome: "failed",
    digestTitle: null,
  });
  expect(failed.postText?.length).toBeGreaterThan(100);
  expect(digestJobs(screen, failed.id)).toMatchObject([{ state: "done", attempts: 0 }]);
  await screen.page.goto("/");
  await expect(screen.page.getByText(NO_DIGEST, { exact: true })).toBeVisible();
  await digestScreens(screen, info, "no-digest");
  await configureDigest(screen, provider);
  await retryInBrowser(failed.id);
  const stored = await readStored(failed.id, provider);
  expect(stored.fetchedAt).toBe(failed.fetchedAt);
  await rowShows(stored.id, stored.digestTitle ?? "", stored.digestTopic ?? "");
  await digestScreens(screen, info, "stored-digest");
  await postLinkRaw(screen.context.request, ESSAY);
  const refreshed = await readStored(stored.id, provider);
  expect(refreshed.generation).toBe(stored.generation + 1);
  await proveKeptDigest(refreshed, wrong, info);
});

async function proveKeptDigest(
  refreshed: Awaited<ReturnType<typeof readStored>>,
  wrong: Readonly<ReturnType<typeof proofProvider>>,
  info: TestInfo,
): Promise<void> {
  await configureDigest(screen, wrong);
  await aiJson(screen, ItemResponseSchema, "POST", `/api/items/${refreshed.id}/digest`);
  const kept = await settled(screen.context.request, refreshed.id, AI_WAIT);
  expect(kept).toMatchObject({
    digestTitle: refreshed.digestTitle,
    digestTopic: refreshed.digestTopic,
    digestOutcome: "failed",
    fetchedAt: refreshed.fetchedAt,
  });
  await rowShows(kept.id, kept.digestTitle ?? "", kept.digestTopic ?? "");
  await expect(screen.page.getByText(NO_DIGEST, { exact: true })).toHaveCount(0);
  await expect(screen.page.getByRole("button", { name: RETRY_LABEL, exact: true })).toBeVisible();
  await digestScreens(screen, info, "kept-digest");
  await info.attach("stored-digest-state", {
    body: JSON.stringify({
      records: digestRecord(screen, kept.id),
      item: kept,
      jobs: digestJobs(screen, kept.id),
      stalePath: "unverified: no real run observed an ordered stale result",
    }),
    contentType: "application/json",
  });
}
