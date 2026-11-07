import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { type Instance, launchFresh, newCode } from "./access.ts";
import { itemOf, postLinkRaw } from "./api.ts";
import {
  BIG_PAGE_TIMEOUT_MS,
  WAR_AND_PEACE,
  WAR_AND_PEACE_LAST_SENTENCE,
  WAR_AND_PEACE_LAST_WORD,
  livePasted,
  pasteLive,
} from "./articles.ts";
import { ROW_LIMIT_BYTES, ownerOf, postTextOf } from "./files.ts";
import { afterFirstClaim, claimLostLines, expireClaim, jobsOf } from "./ingest.ts";
import { newRunId } from "./links.ts";
import { matches } from "./search.ts";
import { isContainerTarget } from "./target.ts";

test.skip(
  !isContainerTarget(),
  "the Worker reads at most 900 KiB of HTML, so no page reaches 1,000,000 bytes of Markdown",
);

let instance: Instance;
let owner: APIRequestContext;

test.beforeEach(async () => {
  const code = newCode();
  instance = launchFresh(code);
  owner = await ownerOf(instance, code, "l".repeat(20));
});

test.afterEach(async () => {
  await owner.dispose();
  instance.stop();
});

async function fetchJobsDone(id: number, count: number): Promise<void> {
  await expect
    .poll(() => jobsOf(id, instance, "fetch").map((job) => job.state), {
      timeout: BIG_PAGE_TIMEOUT_MS,
      intervals: [1000],
    })
    .toEqual(Array.from({ length: count }, () => "done"));
}

function fetchJobIds(id: number): number[] {
  return jobsOf(id, instance, "fetch").map((job) => job.id);
}

const Fingerprints = z.array(z.object({ item_id: z.number() }));

async function reconcilerVisited(id: number): Promise<void> {
  instance.sql(`DELETE FROM search_fingerprints WHERE item_id = ${id}`);
  await expect
    .poll(
      () =>
        instance.query(
          `SELECT item_id FROM search_fingerprints WHERE item_id = ${id}`,
          Fingerprints,
        ).length,
      { timeout: 150_000, intervals: [2000] },
    )
    .toBe(1);
}

test("a Paste of a book over 1,000,000 bytes keeps the whole text in a file, searchable, and a second Paste replaces the file", async () => {
  test.setTimeout(480_000);
  const pasted = await pasteLive(owner, { name: "war-and-peace", url: WAR_AND_PEACE });
  const id = pasted.last.item.id;

  await fetchJobsDone(id, pasted.fetches.length);

  const first = fetchJobIds(id).at(-1) ?? 0;
  const firstKey = `items/${id}/post-${first}-0.md`;
  const item = await itemOf(owner, id);

  expect(item).toMatchObject({ source: "article", kind: "article", status: "ready", fetch: "ok" });
  expect(Buffer.byteLength(item.postText ?? "")).toBeGreaterThan(ROW_LIMIT_BYTES);
  expect(item.postText).toContain(WAR_AND_PEACE_LAST_SENTENCE);
  expect(postTextOf(instance, id)).toEqual({ key: firstKey, inline: null });
  expect(instance.listFiles(`items/${id}/`)).toMatchObject([
    { key: firstKey, size: Buffer.byteLength(item.postText ?? "") },
  ]);
  expect(
    await matches(owner, WAR_AND_PEACE_LAST_WORD),
    "search finds a word of the last chapter",
  ).toEqual([id]);

  const again = await pasteLive(owner, { name: "war-and-peace-again", url: WAR_AND_PEACE });

  expect(again.first.status).toBe(200);
  await fetchJobsDone(id, pasted.fetches.length + again.fetches.length);

  const second = fetchJobIds(id).at(-1) ?? 0;
  const secondKey = `items/${id}/post-${second}-0.md`;

  expect(secondKey).not.toBe(firstKey);
  expect(postTextOf(instance, id)).toEqual({ key: secondKey, inline: null });
  expect(instance.readFile(firstKey), "the replaced file").toBeNull();
  expect(instance.listFiles(`items/${id}/`).map(({ key }) => key)).toEqual([secondKey]);
  expect((await itemOf(owner, id)).postText).toBe(item.postText);

  await reconcilerVisited(id);
  expect(
    await matches(owner, WAR_AND_PEACE_LAST_WORD),
    "search after the search reconciler visited the Item",
  ).toEqual([id]);
});

async function takeoverOfTheBook() {
  const run = newRunId();
  const stopTrap = afterFirstClaim(instance, `takeover=${run}`, "attempts = attempts + 1");
  let id = 0;

  try {
    ({
      body: {
        item: { id },
      },
    } = await postLinkRaw(owner, `${WAR_AND_PEACE}?takeover=${run}`));
    await expect.poll(() => jobsOf(id, instance)[0]?.attempts, { timeout: 30_000 }).toBe(1);
  } finally {
    stopTrap();
  }

  const [job = 0] = fetchJobIds(id);

  await expect
    .poll(() => claimLostLines(instance, job).length, {
      timeout: BIG_PAGE_TIMEOUT_MS,
      intervals: [1000],
    })
    .toBe(1);
  expect(jobsOf(id, instance, "fetch")).toMatchObject([{ state: "running", attempts: 1 }]);
  expect(postTextOf(instance, id), "the row after the rejected finish").toEqual({
    key: null,
    inline: null,
  });
  expect(instance.listFiles(`items/${id}/`), "the file of the overtaken attempt").toEqual([]);

  expireClaim(id, instance);
  await expect
    .poll(() => jobsOf(id, instance, "fetch")[0], {
      timeout: BIG_PAGE_TIMEOUT_MS,
      intervals: [1000],
    })
    .toMatchObject({ state: "done", attempts: 2 });

  return { id, job, item: await itemOf(owner, id) };
}

test("a runner whose claim was taken over publishes nothing and deletes its file, and the Item ends with the file of the claim's next holder", async () => {
  test.setTimeout(480_000);

  const {
    last: { id, job, item },
  } = await livePasted("war-and-peace-takeover", takeoverOfTheBook, ({ item: read }) => read.fetch);

  const key = `items/${id}/post-${job}-2.md`;

  expect(postTextOf(instance, id)).toEqual({ key, inline: null });
  expect(instance.listFiles(`items/${id}/`).map((file) => file.key)).toEqual([key]);
  expect(item.postText).toContain(WAR_AND_PEACE_LAST_SENTENCE);
});
