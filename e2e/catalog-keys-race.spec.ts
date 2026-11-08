import { expect, test } from "@playwright/test";

import { catalogState, expectIntegrity, runCatalogSteps } from "./catalog-keys-run.ts";
import { heldBeforeRename, olderDigestRows } from "./catalog-keys-seed.ts";
import { attemptStep, count, dataSteps, lines, started } from "./identity-run.ts";
import { isContainerTarget } from "./target.ts";

test.describe.configure({ timeout: 480_000 });

const CASES = [
  {
    table: "topics",
    step: "topic-keys",
    linked: "SELECT 1 FROM items WHERE id = 10 AND topic_id IS NOT NULL",
    rivals: "SELECT 1 FROM topics WHERE name = 'Istanbul'",
    survivor: "SELECT 1 FROM items WHERE id = 10 AND topic_id = 3",
  },
  {
    table: "tags",
    step: "tag-keys",
    linked: "SELECT 1 FROM item_tags WHERE item_id = 10",
    rivals: "SELECT 1 FROM tags WHERE name = 'Istanbul'",
    survivor: "SELECT 1 FROM item_tags WHERE item_id = 10 AND tag_id = 3",
  },
] as const;

for (const { table, step, linked, rivals, survivor } of CASES) {
  test(`an older Digest linked while the ${step} step is held before its renames makes a second ${table} row, and the step merges it into the smallest id before it records the version`, async () => {
    const { instance, owner } = await started(heldBeforeRename(table));

    try {
      await attemptStep(owner, instance);

      await expect
        .poll(() => dataSteps(instance).find(({ name }) => name === step)?.cursor, {
          timeout: 120_000,
        })
        .toBe("1|rename:0");

      instance.sql(olderDigestRows(table));

      await expect
        .poll(
          async () => {
            if (!isContainerTarget()) await attemptStep(owner, instance);

            return count(instance, linked);
          },
          { timeout: 150_000 },
        )
        .toBe(1);

      expect(count(instance, rivals)).toBe(1);
      expect(count(instance, `SELECT 1 FROM ${table} WHERE key = 'istanbul'`)).toBe(1);

      instance.sql("DROP TRIGGER hold_rename");
      await runCatalogSteps(owner, instance);

      const state = catalogState(instance);

      expect(state[table].filter(({ name }) => name === "İstanbul" || name === "Istanbul")).toEqual(
        [{ id: 3, key: "istanbul", name: "İstanbul" }],
      );
      expect(count(instance, survivor)).toBe(1);
      expect(lines(instance, "catalog-keys-restaged")).toHaveLength(1);
      expect(state.staged).toBe(0);
      expectIntegrity(instance);
    } finally {
      await owner.dispose();
      instance.stop();
    }
  });
}
