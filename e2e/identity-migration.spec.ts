import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { type Instance, freshDir, newCode } from "./access.ts";
import { postLinkRaw } from "./api.ts";
import { ownerOf } from "./files.ts";
import {
  ALICE_POSTED,
  BEFORE_IDENTITY,
  CAROL_POSTED,
  COLLISIONS,
  ITEMS,
  INTERRUPTED_AT,
  MANY_BEFORE,
  MANY_RENAMES,
  RENAMED,
} from "./identity-seed.ts";
import { eventLines, releaseSweepThrottle, sweepNow } from "./ingest.ts";
import { type Seed, launchSeeded } from "./seeded.ts";
import { isContainerTarget } from "./target.ts";

test.describe.configure({ timeout: 480_000 });

const Stored = z.array(z.object({ id: z.number(), normalized_url: z.string() }));

const Counts = z.array(z.object({ n: z.number() }));

const Marker = z.array(z.object({ name: z.string(), version: z.number() }));

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

function stored(instance: Instance) {
  return instance.query("SELECT id, normalized_url FROM items ORDER BY id", Stored);
}

function otherColumns(instance: Instance) {
  return instance.query(
    "SELECT id, original_url, kind, saved_at, read_state, generation, title FROM items ORDER BY id",
    OtherColumns,
  );
}

function count(instance: Instance, statement: string): number {
  return instance.query(`SELECT count(*) AS n FROM (${statement})`, Counts)[0]?.n ?? -1;
}

function marker(instance: Instance) {
  return instance.query("SELECT name, version FROM data_steps", Marker);
}

function lines(instance: Instance, event: string): string[] {
  return eventLines(instance, event, "");
}

async function started(seed: Seed) {
  const code = newCode();
  const instance = launchSeeded(freshDir(), code, seed);

  return { instance, owner: await ownerOf(instance, code, "m".repeat(20)) };
}

async function attemptStep(owner: APIRequestContext, instance: Instance) {
  if (isContainerTarget()) {
    instance.restart();

    return;
  }

  releaseSweepThrottle(instance);
  await owner.get("/cdn-cgi/local/scheduled");
}

async function runStep(owner: APIRequestContext, instance: Instance) {
  await sweepNow(owner, instance);
  await expect.poll(() => marker(instance).length, { timeout: 90_000 }).toBeGreaterThan(0);
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
    const before = otherColumns(instance);

    await runStep(owner, instance);

    expect(marker(instance)).toEqual([{ name: "item-identity", version: 1 }]);
    expectRenamesAndCollisions(instance);
    expect(otherColumns(instance)).toEqual(before);
    expectRecordsKept(instance);
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
    const planned = lines(instance, "item-identity-planned").length;

    await sweepNow(owner, instance);

    expect(stored(instance)).toEqual(done);
    expect(lines(instance, "item-identity-planned")).toHaveLength(planned);

    instance.sql("DELETE FROM data_steps");
    await runStep(owner, instance);

    expect(stored(instance)).toEqual(done);
    expect(lines(instance, "item-identity-planned")).toHaveLength(planned + 1);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("a step interrupted after two batches keeps those batches whole, records nothing, and finishes to the same result on the next run", async () => {
  const { instance, owner } = await started(MANY_BEFORE);

  try {
    await attemptStep(owner, instance);
    await expect
      .poll(
        () =>
          count(
            instance,
            "SELECT 1 FROM items WHERE id <= 200 AND normalized_url = lower(normalized_url)",
          ),
        {
          timeout: 90_000,
        },
      )
      .toBe(200);

    const half = stored(instance);

    expect(marker(instance)).toEqual([]);
    expect(
      half.filter(({ normalized_url }) => normalized_url !== normalized_url.toLowerCase()),
    ).toHaveLength(MANY_RENAMES - 200);
    expect(half.slice(200).map(({ id }) => id)).toContain(INTERRUPTED_AT);

    instance.sql("DROP TRIGGER stop_batch");
    await runStep(owner, instance);

    expect(stored(instance)).toEqual(
      half.map(({ id }) => ({ id, normalized_url: `https://github.com/org/repo-${id}` })),
    );
  } finally {
    await owner.dispose();
    instance.stop();
  }
});
