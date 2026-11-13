import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { exhaust } from "../src/core/job-finish.ts";
import { HANDLERS } from "../src/core/job-handlers.ts";
import { KIND_CASES } from "./bot-kinds-cases.ts";
import { botInstance, openJobOf } from "./bot-kinds-fixtures.ts";
import { insertedTask, jobRow, taskRow } from "./bot-task-rows.ts";
import { exec } from "./related-fixtures.ts";

const THIRD_SEND = 2;

const ANSWER = '{"kept":true}';

describe("a job that gives up ends every bot task it still holds, the one that holds an answer included", () => {
  for (const { kind } of KIND_CASES) {
    it(kind, async () => {
      const instance = await botInstance();

      try {
        const address = `https://example.com/given-up/${kind}`;

        exec(
          instance,
          "insert into items (id, source, kind, normalized_url, original_url, saved_at) values (500, 'article', 'article', ?, ?, 1)",
          address,
          address,
        );

        const job = await openJobOf(instance, { kind, itemId: 500, attempts: THIRD_SEND });
        const waiting = insertedTask(instance, { kind, executor: "grok-bot", token: "waiting" });
        const answered = insertedTask(instance, { kind, executor: "grok-bot", token: "answered" });

        exec(
          instance,
          "update ai_tasks set job_id = ? where id in (?, ?)",
          job.id,
          waiting,
          answered,
        );
        exec(
          instance,
          "update ai_tasks set sent_at = ?, answered_at = ?, result = ? where id = ?",
          Date.now(),
          Date.now(),
          ANSWER,
          answered,
        );

        await exhaust(
          instance.core,
          { ...job, attemptGeneration: 0 },
          HANDLERS[kind],
          THIRD_SEND + 1,
        );

        const given = taskRow(instance, waiting);
        const unapplied = taskRow(instance, answered);

        assert.deepEqual([given.state, given.refusal], ["failed", "timeout"]);
        assert.deepEqual([unapplied.state, unapplied.refusal], ["failed", "stale"]);
        assert.equal(jobRow(instance, job.id).state, "done");
      } finally {
        await instance.close();
      }
    });
  }
});
