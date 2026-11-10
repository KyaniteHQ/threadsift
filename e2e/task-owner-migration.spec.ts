import { expect, test } from "@playwright/test";
import { z } from "zod";

import { ItemListResponseSchema } from "../src/http/schemas.ts";
import { type Instance, freshDir, newCode } from "./access.ts";
import { ownerOf } from "./files.ts";
import { sweepNow } from "./ingest.ts";
import { launchSeeded } from "./seeded.ts";
import { BEFORE_TASK_OWNER } from "./task-owner-seed.ts";

const StoredTasks = z.array(
  z.object({
    id: z.number(),
    kind: z.string(),
    inputs: z.string(),
    input_revision: z.number(),
    executor: z.string(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    attempts: z.number(),
    deadline: z.number(),
    state: z.string(),
    result: z.string().nullable(),
    refusal: z.string().nullable(),
    status: z.number().nullable(),
    item_id: z.number().nullable(),
  }),
);

const Count = z.array(z.object({ n: z.number() }));

function storedTasks(instance: Instance) {
  return instance.query("SELECT * FROM ai_tasks ORDER BY id", StoredTasks);
}

function countOf(instance: Instance, table: string): number {
  return instance.query(`SELECT count(*) AS n FROM ${table}`, Count)[0]?.n ?? -1;
}

const HTTP = {
  kind: "digest",
  executor: "http",
  provider: "openrouter",
  model: "kept-model",
  input_revision: 1,
  attempts: 1,
};

const DONE = { state: "done", refusal: null, status: null };

const EXPECTED_TASKS = [
  { ...HTTP, ...DONE, id: 1, inputs: "input one", deadline: 11, result: '{"one":1}', item_id: 1 },
  {
    ...HTTP,
    ...DONE,
    id: 3,
    inputs: "input three",
    deadline: 33,
    result: '{"three":3}',
    executor: "caller",
    provider: null,
    model: null,
    input_revision: 2,
    attempts: 2,
    item_id: 2,
  },
  {
    ...HTTP,
    ...DONE,
    id: 6,
    inputs:
      "A post on Notebook Weekly describes how a reading group keeps a shared notebook. Each reader records a useful passage and its source, then compares notes at the next meeting. The group keeps corrections beside the original passages so readers can see what changed.",
    deadline: 66,
    result: '{"six":6}',
    item_id: null,
  },
];

test("AI tasks stored before task owners take the owner of the Digest that names them, the step removes the older tasks no Digest names except the Verify task, and every other row stays as it was", async () => {
  test.setTimeout(180_000);
  const code = newCode();
  const instance = launchSeeded(freshDir(), code, BEFORE_TASK_OWNER);

  try {
    const owner = await ownerOf(instance, code, "m".repeat(20));

    const { items } = ItemListResponseSchema.parse(await (await owner.get("/api/items")).json());

    await sweepNow(owner, instance);
    await expect.poll(() => storedTasks(instance).length, { timeout: 90_000 }).toBe(3);
    await owner.dispose();

    expect(items.map(({ id }) => id).toSorted((left, right) => left - right)).toEqual([1, 2, 3]);
    expect(storedTasks(instance)).toEqual(EXPECTED_TASKS);
    expect(countOf(instance, "digests")).toBe(2);

    instance.restart();
    expect(storedTasks(instance)).toEqual(EXPECTED_TASKS);
  } finally {
    instance.stop();
  }
});
