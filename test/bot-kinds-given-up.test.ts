import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { exhaust } from "../src/core/compose/job-finish.ts";
import { HANDLERS } from "../src/core/compose/job-handlers.ts";
import { KIND_CASES } from "./bot-kinds-cases.ts";
import { answeredAs, botInstance, openJobOf } from "./bot-kinds-fixtures.ts";
import { jobRow, taskRow } from "./bot-task-rows.ts";

const THIRD_SEND = 2;

describe("a job that gives up marks its answered, unapplied bot task stale", () => {
  for (const kindCase of KIND_CASES) {
    const { kind } = kindCase;

    it(kind, async () => {
      const instance = await botInstance();

      try {
        const owner = await kindCase.library(instance);
        const opened = await openJobOf(instance, { kind, itemId: owner, attempts: THIRD_SEND });
        const { job, id } = await answeredAs(instance, { kindCase, job: opened });

        await exhaust(instance.core, job, HANDLERS[kind], THIRD_SEND + 1);

        const unapplied = taskRow(instance, id);

        assert.deepEqual([unapplied.state, unapplied.refusal], ["failed", "stale"]);
        assert.equal(jobRow(instance, job.id).state, "done");
      } finally {
        await instance.close();
      }
    });
  }
});
