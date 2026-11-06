import { expect, test } from "@playwright/test";
import { z } from "zod";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { aiScreen, newSealingKey, countRows } from "./ai.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { attachJson } from "./card.ts";
import { configureDigest } from "./digest.ts";
import { jobsOf, makeJobDue, sweepNow } from "./ingest.ts";

let screen: Awaited<ReturnType<typeof aiScreen>>;

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
  const response = await screen.context.request.post("/api/items", {
    data: { url, digest: { ...SENT_DIGEST, tags } },
  });

  expect(response.status()).toBeLessThan(300);
  const saved = SavedItemResponseSchema.parse(await response.json());
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
  const first = await sendDigest(ESSAY, ["Machine learning"]);
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
  screen.fresh.sql(
    "CREATE TRIGGER defer_backfill AFTER INSERT ON jobs WHEN NEW.kind = 'digest' BEGIN UPDATE jobs SET next_attempt_at = 9007199254740991 WHERE id = NEW.id; END",
  );

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
  screen.fresh.sql("DROP TRIGGER defer_backfill");

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
  screen.fresh.sql(
    "CREATE TRIGGER defer_caller_refresh AFTER INSERT ON jobs WHEN NEW.kind = 'fetch' BEGIN UPDATE jobs SET next_attempt_at = 9007199254740991 WHERE id = NEW.id; END",
  );

  const sent = await request.post("/api/items", {
    data: { url: ESSAY, digest: { ...SENT_DIGEST, title: "Superseded title" } },
  });

  expect(sent.status()).toBe(200);
  await postLinkRaw(request, ESSAY);
  screen.fresh.sql("DROP TRIGGER defer_caller_refresh");
  const fetch = jobsOf(id, screen.fresh, "fetch").at(-1);

  if (fetch === undefined) throw new Error("No refresh fetch");
  makeJobDue(fetch.id, screen.fresh);
  await sweepNow(request, screen.fresh);
  expect((await settled(request, id)).digestTitle).toBe(SENT_DIGEST.title);
  expect(countRows(screen, "ai_tasks")).toBe(5);

  const textless = await request.post("/api/items", {
    data: { url: "https://x.com/threadsift/status/12345", digest: SENT_DIGEST },
  });

  const saved = SavedItemResponseSchema.parse(await textless.json());
  expect((await settled(request, saved.item.id)).digestTitle).toBeNull();

  const pending = screen.fresh.query(
    "SELECT pending_digest AS pending FROM items",
    z.array(z.object({ pending: z.string().nullable() })),
  );

  expect(pending.every((row) => row.pending === null)).toBe(true);
}
