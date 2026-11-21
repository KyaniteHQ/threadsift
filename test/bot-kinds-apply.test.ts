import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import { parseStoredDigest } from "../src/core/contract/digest-schema.ts";
import { DIGEST_ANSWER, KIND_CASES, caseOf } from "./bot-kinds-cases.ts";
import { answeredAs, botInstance, openJobOf } from "./bot-kinds-fixtures.ts";
import { jobRow, libraryDump, rowCount, taskRow, topicPage } from "./bot-task-rows.ts";
import { seedDigested } from "./disagreement-fixtures.ts";
import type { Instance } from "./instance.ts";
import { lockedWriter } from "./locked-writer.ts";

describe("an answered bot task of each kind applies once, and a run of the finished job writes nothing", () => {
  for (const kindCase of KIND_CASES) {
    describe(kindCase.kind, () => {
      let instance: Instance;

      before(async () => {
        instance = await botInstance();
      });

      after(() => instance.close());

      it("writes the answer, completes the task and closes the job, and a second run of that job writes nothing", async () => {
        const owner = await kindCase.library(instance);
        const job = await openJobOf(instance, { kind: kindCase.kind, itemId: owner });
        const sent = await answeredAs(instance, { kindCase, job });

        await executeClaimed(instance.core, sent.job);

        assert.equal(taskRow(instance, sent.id).state, "done");
        assert.equal(jobRow(instance, job.id).state, "done");
        assert.ok(kindCase.wrote(instance, owner));

        const written = libraryDump(instance, job.id);

        await executeClaimed(instance.core, sent.job);

        assert.equal(libraryDump(instance, job.id), written);
      });
    });
  }
});

describe("a Provider switch that abandons an answered task while the job applies it leaves the library as it was", () => {
  for (const kindCase of KIND_CASES) {
    it(kindCase.kind, async () => {
      const instance = await botInstance();

      try {
        const owner = await kindCase.library(instance);
        const job = await openJobOf(instance, { kind: kindCase.kind, itemId: owner });
        const sent = await answeredAs(instance, { kindCase, job });

        const writer = await lockedWriter(instance, [
          `update ai_tasks set state = 'failed', result = null, refusal = 'abandoned', status = null where id = ${String(sent.id)}`,
        ]);

        await executeClaimed(instance.core, sent.job);
        await writer.committed;

        const task = taskRow(instance, sent.id);

        assert.deepEqual([task.state, task.refusal], ["failed", "abandoned"]);
        assert.equal(kindCase.wrote(instance, owner), false);
        assert.notEqual(jobRow(instance, job.id).state, "done");
      } finally {
        await instance.close();
      }
    });
  }
});

describe("an empty answer to a weekly run applies and completes the task", () => {
  for (const kindCase of KIND_CASES.filter(({ empty }) => empty !== null)) {
    it(kindCase.kind, async () => {
      const instance = await botInstance();

      try {
        const owner = await kindCase.library(instance);
        const job = await openJobOf(instance, { kind: kindCase.kind, itemId: owner });
        const sent = await answeredAs(instance, { kindCase, job, empty: true });

        await executeClaimed(instance.core, sent.job);

        assert.deepEqual(
          [
            taskRow(instance, sent.id).state,
            jobRow(instance, job.id).state,
            rowCount(instance, "proposals", "state = 'open'"),
          ],
          ["done", "done", 0],
        );
      } finally {
        await instance.close();
      }
    });
  }
});

describe("a Topic overview that comes back unchanged", () => {
  it("stores a new revision with the same text over the Items it now covers and completes the task", async () => {
    const instance = await botInstance();

    try {
      const overview = caseOf("topic_overview");
      const owner = await overview.library(instance);
      const first = await openJobOf(instance, { kind: "topic_overview", itemId: owner });

      const answeredFirst = await answeredAs(instance, { kindCase: overview, job: first });

      await executeClaimed(instance.core, answeredFirst.job);

      const text = topicPage(instance, 1)?.overview;

      seedDigested(instance, [{ id: 103, topic: 1, token: 7103 }]);

      const job = await openJobOf(instance, { kind: "topic_overview", itemId: owner });
      const unchanged = { ...overview, fits: () => ({ lines: [], unchanged: true }) };
      const sent = await answeredAs(instance, { kindCase: unchanged, job });

      await executeClaimed(instance.core, sent.job);

      const page = topicPage(instance, 1);

      assert.deepEqual(
        [page?.overview, page?.revision, page?.built_from.length, taskRow(instance, sent.id).state],
        [text, 2, 3, "done"],
      );
    } finally {
      await instance.close();
    }
  });
});

describe("a Digest that keeps a comment id the bot was not sent", () => {
  it("is accepted and published without that id", async () => {
    const instance = await botInstance();

    try {
      const digest = caseOf("digest");
      const owner = await digest.library(instance);
      const job = await openJobOf(instance, { kind: "digest", itemId: owner });

      const lenient = {
        ...digest,
        fits: () => ({ ...DIGEST_ANSWER, keptComments: ["t1_c1", "t1_c9"] }),
      };

      const sent = await answeredAs(instance, { kindCase: lenient, job });

      await executeClaimed(instance.core, sent.job);

      const result = taskRow(instance, sent.id).result;
      assert.ok(result !== null);
      assert.deepEqual(parseStoredDigest(result).keptComments, ["t1_c1"]);

      const { comments } = await instance.detail(owner);

      assert.equal(comments.view.filter, "kept");
      assert.deepEqual(
        comments.nodes.filter(({ kind }) => kind === "comment").map(({ id }) => id),
        ["t1_c1"],
      );
    } finally {
      await instance.close();
    }
  });
});
