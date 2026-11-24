import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import { KIND_CASES } from "./bot-kinds-cases.ts";
import { botInstance, openJobOf, selectGrokBot } from "./bot-kinds-fixtures.ts";
import { jobRow, rowCount, taskRows } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./sqlite-fixtures.ts";

describe("what a kind does when there is nothing to ask the bot", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();
  });

  after(() => instance.close());

  it("settles a weekly run with no pairs to compare, closes the job and starts no task", async () => {
    exec(
      instance,
      "insert into items (id, source, kind, normalized_url, original_url, saved_at) values (1, 'article', 'article', 'https://example.com/1', 'https://example.com/1', 1)",
    );

    const job = await openJobOf(instance, { kind: "proposals", itemId: 1 });

    await selectGrokBot(instance);
    await executeClaimed(instance.core, job);

    assert.equal(jobRow(instance, job.id).state, "done");
    assert.equal(rowCount(instance, "ai_tasks"), 0);
  });
});

describe("the payload of each kind builds, so the send reaches the network and fails as unreachable", () => {
  for (const kindCase of KIND_CASES) {
    it(kindCase.kind, async () => {
      const instance = await botInstance();

      try {
        const owner = await kindCase.library(instance);
        const job = await openJobOf(instance, { kind: kindCase.kind, itemId: owner });

        await selectGrokBot(instance);
        await executeClaimed(instance.core, job);

        assert.deepEqual(
          taskRows(instance, "job_id = ?", job.id).map(({ state, refusal }) => [state, refusal]),
          [["failed", "unreachable"]],
        );
        assert.deepEqual(
          [jobRow(instance, job.id).state, jobRow(instance, job.id).attempts],
          ["queued", 1],
        );
      } finally {
        await instance.close();
      }
    });
  }
});
