import { expect, test } from "@playwright/test";

import { count, lines, marker, runStep, stored, stoppedBeforeRenames } from "./identity-run.ts";
import { FAILING_BEFORE, NEWER_RELEASE_VERSION, RENAMED, RIVAL } from "./identity-seed.ts";
import { sweepNow } from "./ingest.ts";

test.describe.configure({ timeout: 480_000 });

test("a row that takes a planned identity between the plan and the renames makes that pair a reported collision, and the rest of the step finishes in the next run", async () => {
  const { instance, owner } = await stoppedBeforeRenames(FAILING_BEFORE);

  try {
    instance.sql(
      `INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at) VALUES (${RIVAL.id}, 'x', 'x-post', '${RIVAL.taken}', '${RIVAL.taken}', 2000)`,
    );

    instance.sql("DROP TRIGGER stop_batch");
    await runStep(owner, instance);

    expect(marker(instance)).toEqual([{ name: "item-identity", version: 2, cursor: null }]);

    const after = new Map(stored(instance).map(({ id, normalized_url: url }) => [id, url]));

    expect(after.get(RIVAL.of)).toBe(RIVAL.stays);
    expect(after.get(RIVAL.id)).toBe(RIVAL.taken);

    for (const [itemId, identity] of RENAMED.filter(([renamedId]) => renamedId !== RIVAL.of)) {
      expect(after.get(itemId), `Item ${itemId}`).toBe(identity);
    }

    const reported = lines(instance, "item-identity-collision").filter((line) =>
      line.includes(`"itemIds":[${RIVAL.of},${RIVAL.id}]`),
    );

    expect(reported).toHaveLength(1);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("a runner of an older release never lowers a newer release's recorded version, even in its last batch", async () => {
  const { instance, owner } = await stoppedBeforeRenames(FAILING_BEFORE);

  try {
    instance.sql(
      `CREATE TRIGGER newer_release BEFORE DELETE ON data_step_renames WHEN (SELECT cursor FROM data_steps WHERE name = 'item-identity') = '2|finish:0' BEGIN UPDATE data_steps SET version = ${NEWER_RELEASE_VERSION}, cursor = NULL WHERE name = 'item-identity'; END`,
    );

    instance.sql("DROP TRIGGER stop_batch");

    await sweepNow(owner, instance);

    await expect
      .poll(() => marker(instance).at(0)?.version ?? 0, { timeout: 90_000 })
      .toBe(NEWER_RELEASE_VERSION);

    expect(count(instance, "SELECT 1 FROM data_step_renames")).toBe(0);

    await sweepNow(owner, instance);

    expect(marker(instance)).toEqual([
      { name: "item-identity", version: NEWER_RELEASE_VERSION, cursor: null },
    ]);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});
