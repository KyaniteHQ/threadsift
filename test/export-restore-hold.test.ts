import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ExportStatusSchema } from "../src/core/contract/export-contract.ts";
import { DAY_MS } from "../src/core/contract/time-units.ts";
import { readyExport } from "./export-restore-fixtures.ts";
import { exportKeys } from "./file-store-fixtures.ts";
import { Instance } from "./instance.ts";
import { holdLibrary } from "./restore-fixtures.ts";
import { sweptWith } from "./weekly-claim-fixtures.ts";

describe("a ready Export is kept 24 hours while a Restore holds the library, as at any other time", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("removes a ready Export at the first sweep past its 24 hours while a Restore that gave up holds the library", async () => {
    const ready = await readyExport(instance);

    holdLibrary(instance, "failed", "gave-up");
    await sweptWith(instance, (now) => {
      instance.database.exec(
        "update exports set finished_at = ? where id = ?",
        now - DAY_MS - 1,
        ready.id,
      );
    });

    assert.deepEqual(await instance.read("GET", "/api/export", ExportStatusSchema), {
      state: "none",
    });
    assert.deepEqual(await exportKeys(instance, ready.id), []);
  });
});
