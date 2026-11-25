import assert from "node:assert/strict";

import { refusedByGuard } from "../src/core/kernel/guards.ts";
import type { Instance } from "./instance.ts";

export async function afterRefusedBatch<Result>(
  instance: Instance,
  staged: () => Promise<void> | void,
  run: () => Promise<Result>,
): Promise<Result> {
  const { db } = instance.core;
  const real = db.batch.bind(db);
  let refusals = 0;

  Object.defineProperty(db, "batch", {
    configurable: true,
    value: async (queries: Parameters<typeof real>[0]) => {
      const [outcome] = await Promise.allSettled([real(queries)]);

      if (outcome?.status === "fulfilled") return outcome.value;

      if (refusedByGuard(outcome?.reason) && refusals === 0) {
        refusals += 1;
        await staged();
      }

      throw outcome?.reason;
    },
  });

  try {
    const result = await run();

    assert.equal(refusals, 1, "a guarded batch was refused before the change was staged");

    return result;
  } finally {
    Reflect.deleteProperty(db, "batch");
  }
}
