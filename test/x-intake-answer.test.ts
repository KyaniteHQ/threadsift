import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { CreatedTokenResponseSchema } from "../src/core/contract/access-wire.ts";
import { botInstance } from "./bot-task-fixtures.ts";
import { insertedTask, taskRow } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { jobRow } from "./job-fixtures.ts";
import {
  answerOf,
  contentOf,
  digestOf,
  largeThreadOf,
  oversizedAnswerOf,
} from "./x-intake-bodies.ts";
import { intakeTo, sentIntake } from "./x-intake-fixtures.ts";
import { PUBLISHED_TABLES, itemRow, stored, verificationRow } from "./x-intake-rows.ts";

describe("an X link answer with the task's credential is stored once and only for the task it was sent for", () => {
  let instance: Instance;
  let agentToken = "";

  before(async () => {
    instance = await botInstance();
    ({ value: agentToken } = await instance.read(
      "POST",
      "/api/tokens",
      CreatedTokenResponseSchema,
      { name: "x-intake" },
    ));
  });

  after(() => instance.close());

  it("stores the thread for verification without showing it, keeps the Digest for the Item, closes the task and the job, and answers a repeat with 409 and no change", async () => {
    const task = await sentIntake(instance);
    const started = Date.now();

    const answer = await intakeTo(instance, task, answerOf(task.statusId));

    assert.equal(answer.status, 204);

    const row = taskRow(instance, task.id);
    const verification = verificationRow(instance, task.itemId);
    const item = itemRow(instance, task.itemId);

    assert.deepEqual([row.state, row.refusal], ["done", null]);
    assert.ok((row.answered_at ?? 0) >= started);
    assert.equal(jobRow(instance, task.job.id).state, "done");
    assert.equal(verification?.thread.replies.length, 1);
    assert.equal(verification?.digest, JSON.stringify(digestOf()));
    assert.deepEqual([item.fetch_result, item.generation], [null, 0]);
    assert.equal(stored(instance, ["thread_comments", "digests"]), "[[],[]]");

    const unchanged = stored(instance, ["ai_tasks", "x_verifications"]);
    const repeat = await intakeTo(instance, task, answerOf(task.statusId));

    assert.equal(repeat.status, 409);
    assert.equal(stored(instance, ["ai_tasks", "x_verifications"]), unchanged);
  });

  it("stores ranked replies, Digest picks, their ancestors and the author thread from 100 intake replies when the full answer exceeds the stored row limit", async () => {
    const task = await sentIntake(instance);
    const value = largeThreadOf(task.statusId);
    const content = JSON.stringify({ ...value, post: { ...value.post, replies: 0 } });
    assert.ok(content.length > 1_499_998);

    const root = BigInt(task.statusId);
    const digest = {
      ...digestOf(),
      keptComments: [2n, 3n, 99n, 101n].map((offset) => `t1_${String(root + offset)}`),
    };
    const response = await intakeTo(instance, task, { content, digest });
    const verification = verificationRow(instance, task.itemId);
    assert.equal(response.status, 204, await response.text());

    const offsets = [100, 99, 98, ...Array.from({ length: 40 }, (_, index) => 43 - index), 1];
    assert.equal(verification?.thread.post.replies, 100);
    assert.deepEqual(
      verification?.thread.replies.map(({ id }) => id),
      offsets.map((offset) => String(BigInt(task.statusId) + BigInt(offset))),
    );
    assert.deepEqual(
      z
        .object({ keptComments: z.array(z.string()) })
        .parse(JSON.parse(verification?.digest ?? "null")).keptComments,
      [2n, 3n, 99n, 101n].map((offset) => String(root + offset)),
    );
  });

  it("refuses a thread when the selected replies exceed the stored row limit and names the limit", async () => {
    const task = await sentIntake(instance);
    const response = await intakeTo(instance, task, oversizedAnswerOf(task.statusId));

    assert.equal(response.status, 400);
    assert.match(await response.text(), /1499998 bytes/u);
    assert.equal(verificationRow(instance, task.itemId), undefined);
  });

  it("keeps a Digest the owner supplied with the link when the answer holds none", async () => {
    const task = await sentIntake(instance);
    const picked = String(BigInt(task.statusId) + 99n);
    const supplied = JSON.stringify({ ...digestOf(), keptComments: [picked] });

    instance.database.exec(
      "update items set pending_digest = ? where id = ?",
      supplied,
      task.itemId,
    );

    const answer = await intakeTo(instance, task, {
      content: JSON.stringify(largeThreadOf(task.statusId)),
    });

    assert.equal(answer.status, 204);
    const verification = verificationRow(instance, task.itemId);
    assert.equal(verification?.digest, supplied);
    assert.ok(verification.thread.replies.some(({ id }) => id === picked));
  });

  it("answers 401 for a missing, wrong, foreign or unknown credential and 403 for a session or an agent token, with no row changed", async () => {
    const task = await sentIntake(instance);
    const other = await sentIntake(instance);
    const body = answerOf(task.statusId);
    const unchanged = stored(instance);

    const unauthorized = await Promise.all(
      [
        { id: task.id, token: null },
        { id: task.id, token: "not-a-task-credential" },
        { id: task.id, token: other.token },
        { id: 999_999, token: task.token },
      ].map(async (who) => {
        const response = await intakeTo(instance, who, body);

        return { status: response.status, text: await response.text() };
      }),
    );

    const path = `/api/ai-tasks/${String(task.id)}/intake`;
    const session = await instance.send("POST", path, body);
    const agent = await instance.sendWithToken(agentToken, "POST", path, body);

    assert.deepEqual(
      unauthorized.map(({ status }) => status),
      [401, 401, 401, 401],
    );
    assert.equal(new Set(unauthorized.map(({ text }) => text)).size, 1);
    assert.deepEqual([session.status, agent.status], [403, 403]);
    assert.equal(stored(instance), unchanged);
  });

  it("answers 400 to a task of another kind and to a body that is not an X thread of the task's post, and leaves the task open", async () => {
    const foreign = { id: 0, token: "tst_foreign-kind" };

    foreign.id = insertedTask(instance, {
      kind: "related_pick",
      executor: "grok-bot",
      token: foreign.token,
    });

    const wrongKind = await intakeTo(instance, foreign, answerOf("5"));

    assert.equal(wrongKind.status, 400);
    assert.match(await wrongKind.text(), /unsupported-task/u);

    const task = await sentIntake(instance);
    const unchanged = stored(instance, PUBLISHED_TABLES);

    const bodies = [
      { content: "not json" },
      { content: contentOf("999") },
      { content: contentOf(task.statusId), unavailable: true },
      { unavailable: false },
      { digest: digestOf() },
      {},
    ];

    const statuses = await Promise.all(
      bodies.map(async (body) => (await intakeTo(instance, task, body)).status),
    );

    assert.deepEqual(statuses, [400, 400, 400, 400, 400, 400]);
    assert.equal(stored(instance, PUBLISHED_TABLES), unchanged);
    assert.equal(taskRow(instance, task.id).state, "running");
  });
});
