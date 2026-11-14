import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { type KindCase, KIND_CASES, caseOf } from "./bot-kinds-cases.ts";
import { answeredAs, botInstance, openJobOf, sentTask } from "./bot-kinds-fixtures.ts";
import { settled } from "./bot-kinds-steps.ts";
import { pastDeadline } from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { jobRow, taskRow, topicLeaseFree } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

describe("an answer whose guard moved between the send and the answer is accepted and then fails the task as stale", () => {
  for (const kindCase of KIND_CASES) {
    for (const { name, move } of kindCase.moves) {
      describe(`${kindCase.kind} after ${name}`, () => {
        let instance: Instance;

        before(async () => {
          instance = await botInstance();
        });

        after(() => instance.close());

        it("writes nothing, fails the task stale and requeues the job without an attempt", async () => {
          const owner = await kindCase.library(instance);

          const job = await openJobOf(instance, {
            kind: kindCase.kind,
            itemId: owner,
            staleRequeues: 2,
          });

          const sent = await answeredAs(instance, {
            kindCase,
            job,
            between: (context) => {
              move(instance, context);
            },
          });

          await settled(instance, kindCase.kind, job);

          const task = taskRow(instance, sent.id);
          const queued = jobRow(instance, job.id);

          assert.deepEqual([task.state, task.refusal], ["failed", "stale"]);
          assert.deepEqual(
            [queued.state, queued.attempts, queued.stale_requeues],
            ["queued", 0, 3],
          );
          assert.equal(kindCase.wrote(instance, owner), false);
        });
      });
    }
  }
});

describe("a Digest the Grok Bot answered after another Digest changed the catalog", () => {
  it("is published at once, with its new Topic and Tag, and the job is not requeued", async () => {
    const instance = await botInstance();

    try {
      const kindCase = caseOf("digest");
      const owner = await kindCase.library(instance);
      const job = await openJobOf(instance, { kind: "digest", itemId: owner });

      const sent = await answeredAs(instance, {
        kindCase,
        job,
        between: () => {
          exec(
            instance,
            "insert into catalog_version (id, version) values (1, 5) on conflict (id) do update set version = version + 5",
          );
        },
      });

      await settled(instance, "digest", job);

      const task = taskRow(instance, sent.id);
      const done = jobRow(instance, job.id);

      assert.deepEqual([task.state, task.refusal], ["done", null]);
      assert.deepEqual([done.state, done.stale_requeues], ["done", 0]);
      assert.equal(kindCase.wrote(instance, owner), true);
    } finally {
      await instance.close();
    }
  });
});

const PHASES = ["waiting", "timed out", "reported an error"] as const;

type Phase = (typeof PHASES)[number];

async function movedWhile(
  instance: Instance,
  {
    kindCase,
    phase,
    move,
  }: Readonly<{ kindCase: KindCase; phase: Phase; move: KindCase["moves"][number]["move"] }>,
) {
  const owner = await kindCase.library(instance);

  const job = await openJobOf(instance, {
    kind: kindCase.kind,
    itemId: owner,
    staleRequeues: 2,
  });

  const sent = await sentTask(instance, kindCase.kind, job);

  move(instance, sent.context);

  if (phase === "timed out") pastDeadline(instance, sent.id);

  if (phase === "reported an error") {
    const reported = await answered(instance, sent, { error: "The bot could not read the input." });

    assert.equal(reported.status, 204);
  }

  await settled(instance, kindCase.kind, job);

  return { sent, job, owner };
}

describe("a task whose input moved before any answer is failed as stale, and no attempt is charged", () => {
  const cases = KIND_CASES.flatMap((kindCase) =>
    kindCase.moves.flatMap(({ name, move }, index) =>
      PHASES.slice(0, index === 0 ? PHASES.length : 1).map((phase) => ({
        kindCase,
        name,
        move,
        phase,
      })),
    ),
  );

  for (const { kindCase, name, move, phase } of cases) {
    it(`${kindCase.kind}, ${phase}, after ${name}`, async () => {
      const instance = await botInstance();

      try {
        const { sent, job, owner } = await movedWhile(instance, { kindCase, phase, move });
        const task = taskRow(instance, sent.id);
        const queued = jobRow(instance, job.id);

        assert.equal(task.state, "failed");
        assert.equal(task.refusal, phase === "reported an error" ? "provider-busy" : "stale");
        assert.deepEqual([queued.state, queued.attempts, queued.stale_requeues], ["queued", 0, 3]);
        assert.equal(kindCase.wrote(instance, owner), false);
        assert.equal(topicLeaseFree(instance, 1), true);
      } finally {
        await instance.close();
      }
    });
  }
});
