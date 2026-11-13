import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { BOT_TASK_KINDS } from "../src/core/bot-task-kinds.ts";
import { applyOutcome } from "../src/core/job-finish.ts";
import { KIND_CASES, caseOf } from "./bot-kinds-cases.ts";
import { botInstance, openJobOf } from "./bot-kinds-fixtures.ts";
import { outcomeOf } from "./bot-kinds-steps.ts";
import { jobRow, rowCount, taskRows } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

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
    const prepared = await BOT_TASK_KINDS.proposals.prepare(instance.core, job);

    assert.equal(prepared.kind, "settled");

    if (prepared.kind === "settled") await applyOutcome(instance.core, job, prepared.outcome);

    assert.equal(jobRow(instance, job.id).state, "done");
    assert.equal(rowCount(instance, "ai_tasks"), 0);
  });

  it("refuses a Digest job whose Item holds a Digest the caller supplied", async () => {
    const owner = await caseOf("digest").library(instance);
    const job = await openJobOf(instance, { kind: "digest", itemId: owner });

    exec(instance, "update items set pending_digest = '{}' where id = ?", owner);

    await assert.rejects(BOT_TASK_KINDS.digest.prepare(instance.core, job));
  });
});

describe("the payload of each kind builds, so the send reaches the network and fails as unreachable", () => {
  for (const kindCase of KIND_CASES) {
    it(kindCase.kind, async () => {
      const instance = await botInstance();

      try {
        const owner = await kindCase.library(instance);
        const job = await openJobOf(instance, { kind: kindCase.kind, itemId: owner });

        await assert.rejects(outcomeOf(instance, kindCase.kind, job), /send failed: unreachable/u);

        assert.deepEqual(
          taskRows(instance, "job_id = ?", job.id).map(({ state, refusal }) => [state, refusal]),
          [["failed", "unreachable"]],
        );
      } finally {
        await instance.close();
      }
    });
  }
});
