import { type APIRequestContext, expect, test } from "@playwright/test";

import type { Instance } from "./access.ts";
import {
  catalogState,
  expectIntegrity,
  finishedSteps,
  runCatalogSteps,
} from "./catalog-keys-run.ts";
import {
  HELD_BEFORE_RENAME,
  PAGED_ITEMS,
  PAGED_PAIRS,
  PAGED_PREVIOUS_RELEASE,
  PREVIOUS_RELEASE,
  RIVAL_TOPIC,
  STOPPED_AT_TAG,
} from "./catalog-keys-seed.ts";
import { answer } from "./filters.ts";
import { attemptStep, count, dataSteps, lines, started } from "./identity-run.ts";
import { matches } from "./search.ts";

test.describe.configure({ timeout: 480_000 });

const STRASSE = "Straße";
const ISTANBUL = "İstanbul";
const IZMIR = "İzmir";
const CAFE_ACCENT = "café";
const SIGMA_UPPER = "ΟΔΟΣ";
const SIGMA_KEY = "οδοσ";

const MERGED_TOPICS = [
  { id: 1, key: "strasse", name: STRASSE },
  { id: 3, key: "istanbul", name: ISTANBUL },
  { id: 5, key: CAFE_ACCENT, name: CAFE_ACCENT },
  { id: 6, key: "cafe", name: "cafe" },
  { id: 7, key: SIGMA_KEY, name: SIGMA_UPPER },
  { id: 9, key: "izmir", name: IZMIR },
];

const MERGED_TAGS = [
  { id: 1, key: "strasse", name: STRASSE },
  { id: 3, key: "istanbul", name: ISTANBUL },
  { id: 5, key: SIGMA_KEY, name: SIGMA_UPPER },
  { id: 7, key: CAFE_ACCENT, name: CAFE_ACCENT },
  { id: 8, key: "cafe", name: "cafe" },
  { id: 9, key: "izmir", name: IZMIR },
  { id: 10, key: "notes", name: "Notes" },
];

const MERGED_OWNERS = [1, 1, 3, 3, 7, 7, 5, 9, 6].map((topicId, index) => ({
  id: index + 1,
  topic_id: topicId,
}));

const MERGED_LINKS = [
  [1, 1],
  [1, 3],
  [2, 1],
  [2, 3],
  [2, 10],
  [3, 3],
  [4, 5],
  [5, 5],
  [6, 7],
  [7, 8],
  [8, 9],
].map(([itemId, tagId]) => ({ item_id: itemId, tag_id: tagId }));

const MERGED_PARTS = [
  [1, [STRASSE, ISTANBUL]],
  [2, [STRASSE, ISTANBUL, "Notes"]],
  [3, [ISTANBUL]],
  [4, [SIGMA_UPPER]],
  [5, [SIGMA_UPPER]],
  [6, [CAFE_ACCENT]],
  [7, ["cafe"]],
  [8, [IZMIR]],
].map(([itemId, names]) => ({
  itemId,
  names: [...(Array.isArray(names) ? names : [])].toSorted(),
}));

function expectMerged(instance: Instance): void {
  const state = catalogState(instance);

  expect(state.topics).toEqual(MERGED_TOPICS);
  expect(state.tags).toEqual(MERGED_TAGS);
  expect(state.owners).toEqual(MERGED_OWNERS);
  expect(state.links).toEqual(MERGED_LINKS);
  expect(state.parts).toEqual(MERGED_PARTS);
  expect(state.staged).toBe(0);
  expect(state.digests.map(({ item_id: itemId }) => itemId)).toEqual([1, 2]);
  expect(JSON.parse(state.digests[1]?.digest ?? "{}")).toMatchObject({
    topic: "STRASSE",
    tags: ["STRASSE", "Istanbul", "Notes"],
  });

  expect(dataSteps(instance)).toEqual([
    { name: "item-identity", version: 1, cursor: null },
    { name: "tag-keys", version: 1, cursor: null },
    { name: "topic-keys", version: 1, cursor: null },
  ]);

  expectIntegrity(instance);
}

async function expectFilters(owner: APIRequestContext): Promise<void> {
  expect(await matches(owner, "STRASSE")).toEqual([]);
  expect(await matches(owner, STRASSE)).toEqual([1, 2]);

  const byTopic = await answer(owner, { topic: "STRASSE" });

  expect(byTopic.items.map(({ id }) => id).toSorted((a, b) => a - b)).toEqual([1, 2]);

  expect(byTopic.counts.topics.map(({ name, count: n }) => [name, n])).toEqual([
    [STRASSE, 2],
    [ISTANBUL, 2],
    [SIGMA_UPPER, 2],
    [CAFE_ACCENT, 1],
    ["cafe", 1],
    [IZMIR, 1],
  ]);

  const byTag = await answer(owner, { tag: "Istanbul" });

  expect(byTag.items.map(({ id }) => id).toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
}

test("on a database the previous release filled, the steps merge Topics and Tags that fold to one key, keep the smallest id and its name, collapse the overlapping Tag link and rebuild the search parts; a rerun changes nothing", async () => {
  const { instance, owner } = await started(PREVIOUS_RELEASE);

  try {
    await runCatalogSteps(owner, instance);
    expectMerged(instance);
    await expectFilters(owner);

    const state = catalogState(instance);

    instance.sql("DELETE FROM data_steps WHERE name IN ('topic-keys', 'tag-keys')");
    await runCatalogSteps(owner, instance);

    expect(catalogState(instance)).toEqual(state);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("a row the previous release writes after a rollback is merged when the records are cleared, and the rest stays as it was", async () => {
  const { instance, owner } = await started(PREVIOUS_RELEASE);

  try {
    await runCatalogSteps(owner, instance);

    const merged = catalogState(instance);

    instance.sql(
      `INSERT INTO topics (id, key, name) VALUES (10, 'straße', '${STRASSE}'); INSERT INTO tags (id, key, name) VALUES (11, 'straße', '${STRASSE}'); UPDATE items SET topic_id = 10 WHERE id = 9; INSERT INTO item_tags (item_id, tag_id) VALUES (8, 11), (1, 11)`,
    );

    instance.sql("DELETE FROM data_steps WHERE name IN ('topic-keys', 'tag-keys')");
    await runCatalogSteps(owner, instance);

    const repaired = catalogState(instance);

    expect(repaired.topics).toEqual(merged.topics);
    expect(repaired.tags).toEqual(merged.tags);
    expect(repaired.owners.map(({ topic_id: topicId }) => topicId)).toEqual([
      1, 1, 3, 3, 7, 7, 5, 9, 1,
    ]);
    expect(repaired.links).toEqual(
      [...merged.links, { item_id: 8, tag_id: 1 }].toSorted(
        (a, b) => a.item_id - b.item_id || a.tag_id - b.tag_id,
      ),
    );
    expect(repaired.parts.find(({ itemId }) => itemId === 8)?.names).toEqual(
      [IZMIR, STRASSE].toSorted(),
    );
    expectIntegrity(instance);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("a unit that fails moves nothing, the next run resumes at the same loser, and 1,200 linked Items and 120 Tags end in one Topic and one Tag per key", async () => {
  const { instance, owner } = await started(PAGED_PREVIOUS_RELEASE);

  try {
    await attemptStep(owner, instance);

    await expect
      .poll(() => count(instance, `SELECT 1 FROM item_tags WHERE tag_id = ${STOPPED_AT_TAG}`), {
        timeout: 120_000,
      })
      .toBe(PAGED_ITEMS - 1000);

    expect(count(instance, "SELECT 1 FROM item_tags WHERE tag_id = 1")).toBe(1000);
    expect(count(instance, `SELECT 1 FROM tags WHERE id = ${STOPPED_AT_TAG}`)).toBe(1);
    expect(dataSteps(instance).find(({ name }) => name === "tag-keys")).toEqual({
      name: "tag-keys",
      version: 0,
      cursor: "1|merge:0",
    });
    expect(finishedSteps(instance)).toContain("topic-keys");

    instance.sql("DROP TRIGGER stop_batch");
    await runCatalogSteps(owner, instance);

    expect(count(instance, "SELECT 1 FROM topics")).toBe(1);
    expect(count(instance, "SELECT 1 FROM items WHERE topic_id = 1")).toBe(PAGED_ITEMS);
    expect(count(instance, "SELECT 1 FROM tags")).toBe(PAGED_PAIRS);
    expect(count(instance, "SELECT 1 FROM tags WHERE id % 2 = 0")).toBe(0);
    expect(count(instance, "SELECT 1 FROM tags WHERE key = 'strasse ' || substr(name, 8)")).toBe(
      PAGED_PAIRS,
    );
    expect(count(instance, "SELECT 1 FROM item_tags")).toBe(PAGED_ITEMS * 2);
    expect(count(instance, "SELECT 1 FROM item_tags WHERE tag_id = 1")).toBe(PAGED_ITEMS);
    expect(count(instance, "SELECT 1 FROM search_parts WHERE kind = 'tags'")).toBe(PAGED_ITEMS);
    expect(
      count(instance, "SELECT 1 FROM search_parts WHERE kind = 'tags' AND body LIKE '%STRASSE%'"),
    ).toBe(0);
    expect(count(instance, "SELECT 1 FROM data_step_renames")).toBe(0);
    expectIntegrity(instance);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("a row that takes a survivor's new key after the merge is left alone and reported, and clearing the records merges it", async () => {
  const { instance, owner } = await started(HELD_BEFORE_RENAME);

  try {
    await attemptStep(owner, instance);

    await expect
      .poll(() => dataSteps(instance).find(({ name }) => name === "topic-keys")?.cursor, {
        timeout: 120_000,
      })
      .toBe("1|rename:0");

    instance.sql(
      `INSERT INTO topics (id, key, name) VALUES (${RIVAL_TOPIC.id}, '${RIVAL_TOPIC.key}', '${RIVAL_TOPIC.name}')`,
    );

    instance.sql("DROP TRIGGER hold_rename");
    await runCatalogSteps(owner, instance);

    const unfinished = lines(instance, "catalog-keys-unfinished");

    expect(unfinished).toHaveLength(1);
    expect(unfinished[0]).toContain(`"step":"topic-keys","ids":[${RIVAL_TOPIC.takenBy}]`);

    const { topics } = catalogState(instance);

    expect(topics.find(({ id }) => id === RIVAL_TOPIC.id)?.key).toBe(RIVAL_TOPIC.key);
    expect(topics.find(({ id }) => id === RIVAL_TOPIC.takenBy)?.key).not.toBe(RIVAL_TOPIC.key);

    instance.sql("DELETE FROM data_steps WHERE name IN ('topic-keys', 'tag-keys')");
    await runCatalogSteps(owner, instance);

    expect(catalogState(instance).topics).toEqual(MERGED_TOPICS);
    expect(lines(instance, "catalog-keys-unfinished")).toHaveLength(1);
    expectIntegrity(instance);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});
