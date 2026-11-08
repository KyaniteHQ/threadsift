import { expect, test } from "@playwright/test";
import { z } from "zod";

import { type Instance, freshDir, newCode } from "./access.ts";
import { ownerOf } from "./files.ts";
import { LONG_BEFORE, LONG_QUERY_CHARS, LONG_RENAMES } from "./identity-seed.ts";
import { sweepNow } from "./ingest.ts";
import { launchSeeded } from "./seeded.ts";

test.describe.configure({ timeout: 480_000 });

const Rows = z.array(z.object({ id: z.number(), renamed: z.number() }));

const Marker = z.array(z.object({ version: z.number() }));

function renamed(instance: Instance): number {
  return instance
    .query(
      "SELECT id, normalized_url = lower(normalized_url) AS renamed FROM items ORDER BY id",
      Rows,
    )
    .filter(({ renamed: done }) => done === 1).length;
}

test(`${LONG_RENAMES} identities of ${LONG_QUERY_CHARS} characters each are renamed and the step is recorded`, async () => {
  const code = newCode();
  const instance = launchSeeded(freshDir(), code, LONG_BEFORE);
  const owner = await ownerOf(instance, code, "m".repeat(20));

  try {
    await sweepNow(owner, instance);

    await expect
      .poll(
        () =>
          instance
            .query("SELECT version FROM data_steps WHERE name = 'item-identity'", Marker)
            .at(0)?.version,
        {
          timeout: 120_000,
        },
      )
      .toBe(1);

    expect(renamed(instance)).toBe(LONG_RENAMES);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});
