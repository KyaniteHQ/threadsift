import { expect, test } from "@playwright/test";
import { z } from "zod";

import type { Instance } from "./access.ts";
import { postLinkRaw } from "./api.ts";
import { attemptStep, count, lines, marker, runStep, started, stored } from "./identity-run.ts";
import {
  ALICE_POSTED,
  APPLIED_BEFORE_STOP,
  BEFORE_IDENTITY,
  CAROL_POSTED,
  COLLISIONS,
  ITEMS,
  INTERRUPTED_AT,
  MANY_BEFORE,
  MANY_RENAMES,
  RENAMED,
  SEEDED_COLUMNS,
} from "./identity-seed.ts";
import { sweepNow } from "./ingest.ts";

test.describe.configure({ timeout: 480_000 });

const OtherColumns = z.array(
  z.object({
    id: z.number(),
    original_url: z.string(),
    kind: z.string(),
    saved_at: z.number(),
    read_state: z.string(),
    generation: z.number(),
    title: z.string().nullable(),
  }),
);

const RENAMED_IDS: ReadonlySet<number> = new Set(RENAMED.map(([id]) => id));

function otherColumns(instance: Instance) {
  return instance.query(
    "SELECT id, original_url, kind, saved_at, read_state, generation, title FROM items ORDER BY id",
    OtherColumns,
  );
}

function expectRenamesAndCollisions(instance: Instance): void {
  const after = stored(instance);

  expect(after.filter(({ id }) => RENAMED_IDS.has(id))).toEqual(
    RENAMED.map(([id, identity]) => ({ id, normalized_url: identity })),
  );

  const untouched = ITEMS.filter(([id]) => !RENAMED_IDS.has(id));

  expect(after.filter(({ id }) => !RENAMED_IDS.has(id))).toEqual(
    untouched.map(([id, , , url]) => ({ id, normalized_url: url })),
  );

  for (const { ids, identity } of COLLISIONS) {
    const reported = lines(instance, "item-identity-collision").filter((line) =>
      line.includes(`"identity":"${identity}"`),
    );

    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain(`"itemIds":[${ids.join(",")}]`);
  }
}

function expectIntegrity(instance: Instance): void {
  expect(instance.query("PRAGMA foreign_key_check", z.array(z.unknown()))).toEqual([]);

  expect(() => {
    instance.sql("INSERT INTO search_index(search_index) VALUES ('integrity-check')");
  }).not.toThrow();
}

function expectRecordsKept(instance: Instance): void {
  expect(count(instance, "SELECT 1 FROM github_repos WHERE item_id = 3")).toBe(1);
  expect(count(instance, "SELECT 1 FROM digests WHERE item_id = 3")).toBe(1);
  expect(count(instance, "SELECT 1 FROM item_tags WHERE item_id = 3")).toBe(1);
  expect(count(instance, "SELECT 1 FROM jobs WHERE item_id = 1")).toBe(1);

  expect(
    count(
      instance,
      "SELECT 1 FROM sqlite_master WHERE type = 'index' AND tbl_name = 'items' AND sql LIKE 'CREATE UNIQUE INDEX%normalized_url%'",
    ),
  ).toBe(1);

  expect(() => {
    instance.sql(
      "UPDATE items SET normalized_url = (SELECT normalized_url FROM items WHERE id = 9) WHERE id = 7",
    );
  }).toThrow();
}

test("the step renames the Items whose new identity is theirs alone with their ids and records kept, reports each collision group and leaves it as it was", async () => {
  const { instance, owner } = await started(BEFORE_IDENTITY);

  try {
    await runStep(owner, instance);

    expect(marker(instance)).toEqual([{ name: "item-identity", version: 2, cursor: null }]);
    expect(count(instance, "SELECT 1 FROM data_step_renames")).toBe(0);
    expectRenamesAndCollisions(instance);
    expect(otherColumns(instance)).toEqual(SEEDED_COLUMNS);
    expectRecordsKept(instance);
    expectIntegrity(instance);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("after the step a paste in any old spelling finds the renamed Item, and a paste of a colliding spelling finds the Item stored in the new form", async () => {
  const { instance, owner } = await started(BEFORE_IDENTITY);

  try {
    await runStep(owner, instance);

    const alice = await postLinkRaw(owner, ALICE_POSTED);
    const carol = await postLinkRaw(owner, CAROL_POSTED);

    expect([alice.status, alice.body.item.id]).toEqual([200, 1]);
    expect([carol.status, carol.body.item.id]).toEqual([200, 9]);
    expect(count(instance, "SELECT 1 FROM items")).toBe(17);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("a repeated step does nothing while its version is recorded, and the same result when the record is cleared", async () => {
  const { instance, owner } = await started(BEFORE_IDENTITY);

  try {
    await runStep(owner, instance);
    const done = stored(instance);
    const finished = lines(instance, "item-identity-finished").length;

    await sweepNow(owner, instance);

    expect(stored(instance)).toEqual(done);
    expect(lines(instance, "item-identity-finished")).toHaveLength(finished);

    instance.sql("DELETE FROM data_steps");
    await runStep(owner, instance);

    expect(stored(instance)).toEqual(done);
    expect(lines(instance, "item-identity-finished")).toHaveLength(finished + 1);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("a step stopped in its rename phase keeps the finished pages and its place, and the next run finishes without redoing them", async () => {
  const { instance, owner } = await started(MANY_BEFORE);

  try {
    await attemptStep(owner, instance);

    await expect
      .poll(
        () =>
          count(
            instance,
            "SELECT 1 FROM items WHERE normalized_url = lower(normalized_url) AND id <= 1130",
          ),
        { timeout: 90_000 },
      )
      .toBe(APPLIED_BEFORE_STOP);

    const half = stored(instance);

    expect(marker(instance)).toEqual([
      { name: "item-identity", version: 0, cursor: `2|apply:${APPLIED_BEFORE_STOP}` },
    ]);

    expect(count(instance, "SELECT 1 FROM data_step_renames")).toBe(
      MANY_RENAMES - APPLIED_BEFORE_STOP,
    );
    expect(half.slice(APPLIED_BEFORE_STOP).map(({ id }) => id)).toContain(INTERRUPTED_AT);

    instance.sql("DROP TRIGGER stop_batch");
    await runStep(owner, instance);

    expect(stored(instance)).toEqual(
      half.map(({ id }) => ({ id, normalized_url: `https://github.com/org/repo-${id}` })),
    );

    expect(marker(instance)).toEqual([{ name: "item-identity", version: 2, cursor: null }]);
    expect(count(instance, "SELECT 1 FROM data_step_renames")).toBe(0);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});
