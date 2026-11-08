import { type TestInfo, expect, test } from "@playwright/test";

import { ItemResponseSchema } from "../src/http/schemas.ts";
import {
  countRows,
  aiJson,
  aiScreen,
  hasAiCredentials,
  wrongAiKey,
  newSealingKey,
  proofProvider,
} from "./ai.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { attachJson } from "./card.ts";
import {
  keptDigestNoteShows,
  noDigestShows,
  retryInBrowser,
  retryRefused,
  rowShows,
} from "./digest-library.ts";
import {
  assertDelay,
  configureDigest,
  digestRecord,
  digestScreens,
  lastDigestTask,
  proveCatalogLinks,
} from "./digest.ts";
import {
  jobsOf,
  makeJobDue,
  pasteBehindDeferredFetch,
  sweepNow,
  unchangedOpenDigest,
} from "./ingest.ts";
import { proveStaleCatalog } from "./stale-digest.ts";

const AI_WAIT = 660_000;

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 900_000 });

let screen: Awaited<ReturnType<typeof aiScreen>>;

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
  expect(jobsOf(item.id, screen.fresh, "digest")).toEqual([]);

  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "network-proof",
  });
  await sweepNow(request, screen.fresh);
  const textless = await postLinkRaw(request, "https://x.com/threadsift/status/12345");
  await settled(request, textless.body.item.id);
  expect(jobsOf(textless.body.item.id, screen.fresh, "digest")).toEqual([]);
  expect(jobsOf(item.id, screen.fresh, "digest")).toHaveLength(1);
  await expect.poll(() => jobsOf(item.id, screen.fresh, "digest")[0]?.attempts).toBe(1);
  const first = jobsOf(item.id, screen.fresh, "digest")[0];
  expect(first?.state).toBe("queued");
  expect((await itemOf(request, item.id)).status).toBe("processing");
  await assertDelay(screen, 1, 30_000, item.id, info);
  await unchangedOpenDigest(screen, item.id);

  if (first === undefined) throw new Error("no Digest job");
  makeJobDue(first.id, screen.fresh);
  await sweepNow(request, screen.fresh);
  await expect.poll(() => jobsOf(item.id, screen.fresh, "digest")[0]?.attempts).toBe(2);
  await assertDelay(screen, 2, 120_000, item.id, info);
  makeJobDue(first.id, screen.fresh);
  await sweepNow(request, screen.fresh);
  const end = await settled(request, item.id);
  expect(end).toMatchObject({
    status: "ready",
    reason: null,
    digestTitle: null,
    digestTopic: null,
    digestOutcome: "failed",
  });
  expect(jobsOf(item.id, screen.fresh, "digest")).toMatchObject([{ state: "done", attempts: 3 }]);
});

async function readStored(id: number, provider: Readonly<ReturnType<typeof proofProvider>>) {
  const item = await settled(screen.context.request, id, AI_WAIT);
  const records = digestRecord(screen, id);
  expect(records).toHaveLength(1);
  const record = records[0];
  expect(record).toMatchObject({
    provider: provider.provider,
    model: provider.model,
    generation: record?.currentGeneration,
    revision: record?.currentGeneration,
    taskItemId: id,
    state: "done",
  });

  if (record === undefined) throw new Error("no stored Digest");
  const digest = record.digest;
  expect(item).toMatchObject({
    status: "ready",
    reason: null,
    digestOutcome: "none",
    digestTitle: digest.title,
    digestTopic: digest.topic,
  });

  return item;
}

test("wrong keys give up once, Digest-only retry keeps the fetch, refresh replaces the Digest, and failed regeneration keeps it", async ({
  browser,
}, info) => {
  test.skip(
    !hasAiCredentials() && process.env["THREADSIFT_AI_REQUIRED"] !== "true",
    "Workers AI credentials unavailable; pull request runs skip the real Digest proof, and the run on main after merge runs it.",
  );
  expect(hasAiCredentials()).toBe(true);
  screen = await aiScreen(browser, newSealingKey());
  const provider = proofProvider();
  const wrong = { ...provider, key: wrongAiKey() };
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
  expect(jobsOf(failed.id, screen.fresh, "digest")).toMatchObject([{ state: "done", attempts: 0 }]);
  await noDigestShows(screen.page, failed.id);
  await digestScreens(screen, info, "no-digest");
  await proveModelGiveUp(failed.id, provider, info);
  await configureDigest(screen, provider);
  await proveStaleCatalog(screen, failed.id, () => retryInBrowser(screen.page, failed.id), info);
  const stored = await readStored(failed.id, provider);
  await proveCatalogLinks(screen, stored.id, info);
  expect(stored.fetchedAt).toBe(failed.fetchedAt);
  await rowShows(screen.page, stored.id, stored.digestTitle ?? "", stored.digestTopic ?? "");
  await digestScreens(screen, info, "stored-digest");
  const generation = digestRecord(screen, stored.id)[0]?.generation ?? 0;
  await refreshBehindFetch(stored.id);
  const refreshed = await readStored(stored.id, provider);
  expect(digestRecord(screen, stored.id)[0]?.generation).toBe(generation + 1);
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
  expect(refreshed.digest).not.toBeNull();
  expect(kept.digest).toEqual(refreshed.digest);
  await rowShows(screen.page, kept.id, kept.digestTitle ?? "", kept.digestTopic ?? "");
  await keptDigestNoteShows(screen.page, kept.id);
  await digestScreens(screen, info, "kept-digest");
  await refuseRetryPost(kept.id);
  await attachJson(
    info,
    "stored-digest-state.json",
    JSON.stringify({
      records: digestRecord(screen, kept.id),
      item: kept,
      jobs: jobsOf(kept.id, screen.fresh),
      stalePath: "proved by the ordered catalog trigger scenario",
    }),
  );
}

async function refreshBehindFetch(id: number): Promise<void> {
  const before = countRows(screen, "ai_tasks");
  const request = screen.context.request;
  await pasteBehindDeferredFetch(screen, async () => {
    await postLinkRaw(request, ESSAY);
    const queued = await screen.context.request.post(`/api/items/${id}/digest`, { data: {} });
    expect(queued.status()).toBe(200);
    const rows = jobsOf(id, screen.fresh).filter((job) => job.state !== "done");
    expect(rows).toMatchObject([
      { kind: "fetch", state: "queued" },
      { kind: "digest", state: "queued", attempts: 0 },
    ]);
    await sweepNow(request, screen.fresh);
    expect(jobsOf(id, screen.fresh, "digest").at(-1)).toMatchObject({
      state: "queued",
      attempts: 0,
    });

    return [id];
  });
  await settled(request, id, AI_WAIT);
  expect(countRows(screen, "ai_tasks")).toBe(before + 1);
}

async function refuseRetryPost(id: number): Promise<void> {
  screen.fresh.sql(
    "CREATE TRIGGER refuse_digest_job BEFORE INSERT ON jobs WHEN NEW.kind = 'digest' BEGIN SELECT RAISE(FAIL, 'Digest enqueue refused'); END",
  );

  try {
    await retryRefused(screen.page, id);
  } finally {
    screen.fresh.sql("DROP TRIGGER refuse_digest_job");
  }
}

async function proveModelGiveUp(
  id: number,
  provider: Readonly<ReturnType<typeof proofProvider>>,
  info: TestInfo,
): Promise<void> {
  await configureDigest(screen, { ...provider, model: "@cf/threadsift/nonexistent-model-proof" });
  await aiJson(screen, ItemResponseSchema, "POST", `/api/items/${id}/digest`);
  await expect
    .poll(() => jobsOf(id, screen.fresh, "digest").at(-1), { timeout: 30_000 })
    .toMatchObject({ state: "done", attempts: 0 });
  expect(await itemOf(screen.context.request, id)).toMatchObject({
    digestOutcome: "failed",
    digestTitle: null,
  });
  await attachJson(info, "terminal-model-refusal.json", JSON.stringify(lastDigestTask(screen)));
}
