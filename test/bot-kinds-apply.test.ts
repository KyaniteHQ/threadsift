import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { DIGEST_ANSWER, KIND_CASES, caseOf } from "./bot-kinds-cases.ts";
import { answeredAs, botInstance, openJobOf } from "./bot-kinds-fixtures.ts";
import { appliedAgain, settled } from "./bot-kinds-steps.ts";
import { jobRow, libraryDump, rowCount, taskRow, topicPage } from "./bot-task-rows.ts";
import { seedDigested } from "./disagreement-fixtures.ts";
import type { Instance } from "./instance.ts";

const KeptSchema = z.object({ keptComments: z.array(z.string()) });

describe("an answered bot task of each kind applies once under the guard its executor keeps", () => {
  for (const kindCase of KIND_CASES) {
    describe(kindCase.kind, () => {
      let instance: Instance;

      before(async () => {
        instance = await botInstance();
      });

      after(() => instance.close());

      it("writes the answer, completes the task and closes the job, and a second apply of the same answer writes nothing", async () => {
        const owner = await kindCase.library(instance);
        const job = await openJobOf(instance, { kind: kindCase.kind, itemId: owner });
        const sent = await answeredAs(instance, { kindCase, job });

        await settled(instance, kindCase.kind, job);

        assert.equal(taskRow(instance, sent.id).state, "done");
        assert.equal(jobRow(instance, job.id).state, "done");
        assert.ok(kindCase.wrote(instance, owner));

        const written = libraryDump(instance);

        await appliedAgain(instance, kindCase.kind, { job, task: taskRow(instance, sent.id) });

        assert.equal(libraryDump(instance), written);
      });
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

        await settled(instance, kindCase.kind, job);

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

      await answeredAs(instance, { kindCase: overview, job: first });
      await settled(instance, "topic_overview", first);

      const text = topicPage(instance, 1)?.overview;

      seedDigested(instance, [{ id: 103, topic: 1, token: 7103 }]);

      const job = await openJobOf(instance, { kind: "topic_overview", itemId: owner });
      const unchanged = { ...overview, fits: () => ({ lines: [], unchanged: true }) };
      const sent = await answeredAs(instance, { kindCase: unchanged, job });

      await settled(instance, "topic_overview", job);

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

      await settled(instance, "digest", job);

      const published = KeptSchema.parse(JSON.parse(taskRow(instance, sent.id).result ?? "null"));

      assert.deepEqual(published.keptComments, ["t1_c1"]);
    } finally {
      await instance.close();
    }
  });
});
