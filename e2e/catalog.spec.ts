import { expect, test } from "@playwright/test";
import { z } from "zod";

import { aiScreen, newSealingKey, countRows } from "./ai.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { attachJson } from "./card.ts";
import { configureDigest } from "./digest.ts";
import { deferJobs, jobsOf, makeJobDue, sweepNow } from "./ingest.ts";

let screen: Awaited<ReturnType<typeof aiScreen>>;

test.describe.configure({ timeout: 180_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

test.afterEach(async () => {
  await screen?.close();
});

const SENT_DIGEST = {
  title: "Caller title",
  topic: "Reading",
  tags: ["Machine learning"],
  summary: "A caller supplies this Digest.",
  keyPoints: ["The caller chooses the names."],
} as const;

function catalogCounts() {
  return screen.fresh.query(
    "SELECT (SELECT count(*) FROM topics) AS topics, (SELECT count(*) FROM tags) AS tags, coalesce((SELECT version FROM catalog_version WHERE id = 1), 0) AS version, (SELECT count(*) FROM item_tags) AS links",
    z.array(
      z.object({ topics: z.number(), tags: z.number(), version: z.number(), links: z.number() }),
    ),
  )[0];
}

async function sendDigest(url: string, tags: readonly string[]) {
  const { status, body: saved } = await postLinkRaw(screen.context.request, url, {
    ...SENT_DIGEST,
    tags,
  });

  expect(status).toBeLessThan(300);
  const item = await settled(screen.context.request, saved.item.id);
  expect(item).toMatchObject({
    digestTitle: SENT_DIGEST.title,
    digestTopic: SENT_DIGEST.topic,
    digestOutcome: "none",
  });

  return item;
}

test("caller Digests publish without a Provider, preserve first spelling, and replace links by normalized key", async ({
  browser,
}, info) => {
  screen = await aiScreen(browser, newSealingKey());

  const invalid = await screen.context.request.post("/api/items", {
    data: { url: ESSAY, digest: { ...SENT_DIGEST, tags: ["a", "b", "c", "d"] } },
  });

  expect(invalid.status()).toBe(400);
  expect(countRows(screen, "items")).toBe(0);
  const first = await sendDigest(ESSAY, ["Machine learning", "ｍａｃｈｉｎｅ  Learning"]);
  expect(catalogCounts()).toEqual({ topics: 1, tags: 1, version: 2, links: 1 });
  await sendDigest(ESSAY, ["ｍａｃｈｉｎｅ  Learning"]);
  expect(
    screen.fresh.query(
      "SELECT key, name FROM tags",
      z.array(z.object({ key: z.string(), name: z.string() })),
    ),
  ).toEqual([{ key: "machine learning", name: "Machine learning" }]);
  expect(catalogCounts()).toEqual({ topics: 1, tags: 1, version: 2, links: 1 });
  await sendDigest(ESSAY, ["Reading notes"]);
  expect(catalogCounts()).toEqual({ topics: 1, tags: 2, version: 3, links: 1 });
  await Promise.all([
    sendDigest("https://stephango.com/flexoki", ["Shared tag"]),
    sendDigest("https://stephango.com/concise", ["shared  TAG"]),
  ]);
  expect(catalogCounts()).toEqual({ topics: 1, tags: 3, version: 4, links: 3 });
  expect(
    screen.fresh.query(
      "SELECT count(*) AS count FROM item_tags JOIN tags ON tags.id = item_tags.tag_id WHERE tags.key = 'shared tag'",
      z.array(z.object({ count: z.number() })),
    ),
  ).toEqual([{ count: 2 }]);

  const tasks = screen.fresh.query(
    "SELECT executor, state FROM ai_tasks",
    z.array(z.object({ executor: z.string(), state: z.string() })),
  );

  expect(tasks).toHaveLength(5);
  expect(tasks.every((task) => task.executor === "caller" && task.state === "done")).toBe(true);
  await attachJson(
    info,
    "caller-catalog.json",
    JSON.stringify({ counts: catalogCounts(), tasks, first }),
  );
  await proveLastPaste(first.id);
});

test("saving a Provider opens older Item Digests once and sets processing atomically", async ({
  browser,
}, info) => {
  screen = await aiScreen(browser, newSealingKey());
  const request = screen.context.request;

  const older = await Promise.all(
    [ESSAY, "https://stephango.com/flexoki", "https://stephango.com/concise"].map(async (url) => {
      const saved = await postLinkRaw(request, url);

      return settled(request, saved.body.item.id);
    }),
  );

  expect(older.every((item) => (item.postText?.length ?? 0) > 100)).toBe(true);
  const restore = deferJobs(screen.fresh, "digest");

  const unreachable = {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "network-proof",
  };

  await configureDigest(screen, unreachable);
  const backfill = older.flatMap((item) => jobsOf(item.id, screen.fresh, "digest"));
  expect(backfill).toHaveLength(3);

  for (const item of older) expect((await itemOf(request, item.id)).status).toBe("processing");
  await configureDigest(screen, unreachable);
  expect(older.flatMap((item) => jobsOf(item.id, screen.fresh, "digest"))).toEqual(backfill);
  restore();

  for (const job of backfill) makeJobDue(job.id, screen.fresh);
  await sweepNow(request, screen.fresh);
  await expect
    .poll(
      () =>
        older
          .flatMap((item) => jobsOf(item.id, screen.fresh, "digest"))
          .every((job) => job.attempts === 1),
      { timeout: 30_000 },
    )
    .toBe(true);
  await attachJson(info, "backfill-jobs.json", JSON.stringify(backfill));
});

async function proveLastPaste(id: number): Promise<void> {
  const request = screen.context.request;
  const restore = deferJobs(screen.fresh, "fetch");

  const sent = await postLinkRaw(request, ESSAY, { ...SENT_DIGEST, title: "Superseded title" });
  expect(sent.status).toBe(200);
  await postLinkRaw(request, ESSAY);
  restore();
  const fetch = jobsOf(id, screen.fresh, "fetch").at(-1);

  if (fetch === undefined) throw new Error("No refresh fetch");
  makeJobDue(fetch.id, screen.fresh);
  await sweepNow(request, screen.fresh);
  expect((await settled(request, id)).digestTitle).toBe(SENT_DIGEST.title);
  expect(countRows(screen, "ai_tasks")).toBe(5);

  const { body: saved } = await postLinkRaw(
    request,
    "https://x.com/threadsift/status/12345",
    SENT_DIGEST,
  );

  expect((await settled(request, saved.item.id)).digestTitle).toBeNull();

  const pending = screen.fresh.query(
    "SELECT pending_digest AS pending FROM items",
    z.array(z.object({ pending: z.string().nullable() })),
  );

  expect(pending.every((row) => row.pending === null)).toBe(true);
}

test("a corrupt older Digest cannot stop a sweep, and an unusable saved key still opens a Digest", async ({
  browser,
}, info) => {
  screen = await aiScreen(browser, newSealingKey());
  const older = await sendDigest(ESSAY, ["Machine learning"]);
  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "network-proof",
  });
  screen.fresh.sql(
    `UPDATE digests SET digest = 'not-json' WHERE item_id = ${older.id}; UPDATE items SET topic_id = NULL WHERE id = ${older.id}; UPDATE settings SET sealed_key = 'not-a-sealed-key'`,
  );
  const restore = deferJobs(screen.fresh, "fetch");
  const saved = await postLinkRaw(screen.context.request, "https://stephango.com/flexoki");
  restore();
  const job = jobsOf(saved.body.item.id, screen.fresh, "fetch")[0];

  if (job === undefined) throw new Error("No due fetch");
  makeJobDue(job.id, screen.fresh);
  await sweepNow(screen.context.request, screen.fresh);
  await expect
    .poll(() => screen.fresh.logs().includes(`Older Digest ${older.id} linking failed`), {
      timeout: 90_000,
    })
    .toBe(true);
  const item = await settled(screen.context.request, saved.body.item.id);
  expect(item.postText?.length).toBeGreaterThan(100);
  expect(item).toMatchObject({ status: "ready", digestOutcome: "failed", digestTitle: null });
  expect(jobsOf(item.id, screen.fresh, "digest")).toMatchObject([{ state: "done", attempts: 0 }]);

  const evidence = {
    olderId: older.id,
    item,
    jobs: jobsOf(item.id, screen.fresh),
    log: `Older Digest ${older.id} linking failed`,
  };

  await attachJson(info, "corrupt-older-digest-and-unusable-key.json", JSON.stringify(evidence));
});
