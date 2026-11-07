import { expect, test } from "@playwright/test";
import { z } from "zod";

import { aiScreen, newSealingKey } from "./ai.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { attachJson } from "./card.ts";
import {
  SENT_DIGEST,
  agentHeaders,
  callerTasks,
  catalogCounts,
  expectPublishedOwners,
  recordPublished,
  invalidDigests,
  proveLastPaste,
  proveLegacyTopic,
  sendDigest,
  topicLink,
  unlinkDigests,
} from "./catalog.ts";
import { configureDigest } from "./digest.ts";
import { deferJobs, jobsOf, makeJobDue, pasteBehindDeferredFetch, sweepNow } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

let screen: Awaited<ReturnType<typeof aiScreen>>;

test.describe.configure({ timeout: 360_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

test.afterEach(async () => {
  await screen?.close();
});

const UNREACHABLE = {
  provider: "openai-compatible",
  baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
  model: "unreachable",
  key: "network-proof",
} as const;

test("caller Digests publish without a Provider, preserve first spelling, and replace links by normalized key", async ({
  browser,
}, info) => {
  screen = await aiScreen(browser, newSealingKey());
  await invalidDigests(screen);

  const first = await sendDigest(screen, ESSAY, {
    tags: ["Machine learning", "ｍａｃｈｉｎｅ  Learning"],
    headers: await agentHeaders(screen),
  });

  expect(catalogCounts(screen)).toEqual({ topics: 1, tags: 1, version: 2, links: 1 });
  await sendDigest(screen, ESSAY, { tags: ["ｍａｃｈｉｎｅ  Learning"], topic: "reading" });
  expect(
    screen.fresh.query(
      "SELECT key, name FROM tags",
      z.array(z.object({ key: z.string(), name: z.string() })),
    ),
  ).toEqual([{ key: "machine learning", name: "Machine learning" }]);
  expect(catalogCounts(screen)).toEqual({ topics: 1, tags: 1, version: 2, links: 1 });
  await proveLegacyTopic(screen, first.id);
  const replacement = await sendDigest(screen, ESSAY, { tags: ["Reading notes"] });
  expect(catalogCounts(screen)).toEqual({ topics: 1, tags: 2, version: 3, links: 1 });
  await concurrentDigests();
  expect(catalogCounts(screen)).toEqual({ topics: 1, tags: 3, version: 4, links: 3 });
  expect(
    screen.fresh.query(
      "SELECT count(*) AS count FROM item_tags JOIN tags ON tags.id = item_tags.tag_id WHERE tags.key = 'shared tag'",
      z.array(z.object({ count: z.number() })),
    ),
  ).toEqual([{ count: 2 }]);

  const tasks = callerTasks(screen);

  expect(tasks).toHaveLength(5);
  expect(tasks.every((task) => task.executor === "caller" && task.state === "done")).toBe(true);
  expectPublishedOwners(screen);
  await attachJson(
    info,
    "caller-catalog.json",
    JSON.stringify({ counts: catalogCounts(screen), tasks, first }),
  );
  await proveLastPaste(screen, first.id, replacement.digestTitle ?? "");
});

async function concurrentDigests(): Promise<void> {
  const expected: { id: number; title: string }[] = [];
  await pasteBehindDeferredFetch(screen, async () => {
    const replies = await Promise.all([
      postLinkRaw(screen.context.request, "https://stephango.com/flexoki", {
        ...SENT_DIGEST,
        title: "Concurrent first",
        tags: ["Shared tag"],
      }),
      postLinkRaw(screen.context.request, "https://stephango.com/concise", {
        ...SENT_DIGEST,
        title: "Concurrent second",
        tags: ["shared  TAG"],
      }),
    ]);

    for (const [index, reply] of replies.entries())
      expected.push({
        id: reply.body.item.id,
        title: index === 0 ? "Concurrent first" : "Concurrent second",
      });

    return expected.map(({ id }) => id);
  });

  for (const { id, title } of expected) {
    expect((await settled(screen.context.request, id)).digestTitle).toBe(title);
    recordPublished(screen, id);
  }
}

test("saving a Provider opens eligible older Item Digests once and preserves exclusions", async ({
  browser,
}, info) => {
  screen = await aiScreen(browser, newSealingKey());
  const request = screen.context.request;

  const older = await Promise.all(
    [ESSAY, "https://stephango.com/flexoki", "https://stephango.com/concise"].map(async (url) =>
      settled(request, (await postLinkRaw(request, url)).body.item.id),
    ),
  );

  expect(older.every((item) => (item.postText?.length ?? 0) > 100)).toBe(true);
  const excluded = await backfillExclusions();
  const before = excluded.map(({ id }) => jobsOf(id, screen.fresh, "digest"));
  const restore = deferJobs(screen.fresh, "digest");
  await configureDigest(screen, UNREACHABLE);
  const backfill = older.flatMap(({ id }) => jobsOf(id, screen.fresh, "digest"));
  expect(backfill).toHaveLength(3);

  for (const item of older) {
    expect(jobsOf(item.id, screen.fresh, "digest")).toHaveLength(1);
    expect((await itemOf(request, item.id)).status).toBe("processing");
  }

  expect(excluded.map(({ id }) => jobsOf(id, screen.fresh, "digest"))).toEqual(before);

  for (const item of excluded) expect(await itemOf(request, item.id)).toEqual(item);
  await configureDigest(screen, UNREACHABLE);
  expect(older.flatMap(({ id }) => jobsOf(id, screen.fresh, "digest"))).toEqual(backfill);
  restore();

  for (const job of backfill) makeJobDue(job.id, screen.fresh);
  await sweepNow(request, screen.fresh);
  await expect
    .poll(
      () =>
        older
          .flatMap(({ id }) => jobsOf(id, screen.fresh, "digest"))
          .every((job) => job.attempts === 1),
      { timeout: 30_000 },
    )
    .toBe(true);
  await attachJson(info, "backfill-jobs.json", JSON.stringify({ backfill, excluded }));
});

async function backfillExclusions() {
  const stored = await sendDigest(screen, `${ESSAY}?stored=true`, { tags: ["Stored"] });

  const failedDigest = await settled(
    screen.context.request,
    (await postLinkRaw(screen.context.request, `${ESSAY}?failed-digest=true`)).body.item.id,
  );

  const failedItem = await settled(
    screen.context.request,
    (await postLinkRaw(screen.context.request, `${ESSAY}?failed-item=true`)).body.item.id,
  );

  const textless = await settled(
    screen.context.request,
    (await postLinkRaw(screen.context.request, "https://x.com/threadsift/status/12345")).body.item
      .id,
  );

  screen.fresh.sql(
    `UPDATE items SET digest_failed = 1 WHERE id = ${failedDigest.id}; UPDATE items SET status = 'failed', reason = 'gave-up' WHERE id = ${failedItem.id}`,
  );

  return Promise.all(
    [stored, failedDigest, failedItem, textless].map(({ id }) =>
      itemOf(screen.context.request, id),
    ),
  );
}

test("a corrupt older Digest does not stop the next older Digest linking, and an unusable saved key still opens a Digest", async ({
  browser,
}, info) => {
  screen = await aiScreen(browser, newSealingKey());
  const older = await sendDigest(screen, ESSAY, { tags: ["Machine learning"] });
  const next = await sendDigest(screen, "https://stephango.com/concise", { tags: ["Next"] });
  expect(older.id).toBeLessThan(next.id);
  unlinkDigests(screen, [older.id, next.id]);
  screen.fresh.sql(`UPDATE digests SET digest = 'not-json' WHERE item_id = ${older.id}`);
  await configureDigest(screen, UNREACHABLE);
  screen.fresh.sql("UPDATE settings SET sealed_key = 'not-a-sealed-key'");

  const [id] = await pasteBehindDeferredFetch(screen, async () => [
    (await postLinkRaw(screen.context.request, "https://stephango.com/flexoki")).body.item.id,
  ]);

  if (id === undefined) throw new Error("No due fetch");
  await expect.poll(() => topicLink(screen, next.id), { timeout: 90_000 }).not.toBeNull();
  expect(topicLink(screen, older.id)).toBeNull();
  const item = await settled(screen.context.request, id);
  expect(item.postText?.length).toBeGreaterThan(100);
  expect(item).toMatchObject({ status: "ready", digestOutcome: "failed", digestTitle: null });
  expect(jobsOf(item.id, screen.fresh, "digest")).toMatchObject([{ state: "done", attempts: 0 }]);
  await attachJson(
    info,
    "corrupt-older-digest-and-unusable-key.json",
    JSON.stringify({
      olderId: older.id,
      linked: next.id,
      item,
      jobs: jobsOf(item.id, screen.fresh),
    }),
  );
});

test("older linking advances past a full page of corrupt Digests", async ({ browser }, info) => {
  screen = await aiScreen(browser, newSealingKey());

  const damaged = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      sendDigest(screen, `${ESSAY}?damaged=${index}`, { tags: ["Older"] }),
    ),
  );

  const good = await sendDigest(screen, `${ESSAY}?good=true`, { tags: ["Older"] });
  expect(good.id).toBeGreaterThan(Math.max(...damaged.map(({ id }) => id)));
  unlinkDigests(screen, [...damaged.map(({ id }) => id), good.id]);
  screen.fresh.sql(
    `UPDATE digests SET digest = 'not-json' WHERE item_id IN (${damaged.map(({ id }) => id).join(",")})`,
  );
  await sweepNow(screen.context.request, screen.fresh);

  if (!isContainerTarget()) await sweepNow(screen.context.request, screen.fresh);
  await expect.poll(() => topicLink(screen, good.id), { timeout: 150_000 }).not.toBeNull();

  for (const item of damaged) expect(topicLink(screen, item.id)).toBeNull();
  await attachJson(
    info,
    "older-linking-cursor.json",
    JSON.stringify({ damaged: damaged.map(({ id }) => id), linked: good.id }),
  );
});
