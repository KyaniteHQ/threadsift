import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeClaimed } from "../src/core/jobs.ts";
import { KIND_CASES, type KindCase } from "./bot-kinds-cases.ts";
import { answeredAs, botInstance, openJobOf } from "./bot-kinds-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { jobRow, rowCount, taskRow, taskRows, topicFailures } from "./bot-task-rows.ts";
import { chooseGrokBot, generationOf } from "./grok-bot-provider-fixtures.ts";
import {
  claimedAgain,
  selectedWithUnreadableKey,
  unansweredClaim,
} from "./grok-bot-provider-walk.ts";
import type { Instance } from "./instance.ts";

const FIRST_RETRY_MS = 30_000;

const SECOND_RETRY_MS = 120_000;

const TOLERANCE_MS = 5000;

const FAILURE_SHOWN = {
  digest: (instance: Instance, owner: number) =>
    Promise.resolve(
      rowCount(instance, "items", `id = ${String(owner)} and digest_failed = 1`) === 1,
    ),
  topic_overview: (instance: Instance) =>
    Promise.resolve(topicFailures(instance).some(({ failure }) => failure === "gave-up")),
  proposals: (instance: Instance) => Promise.resolve(rowCount(instance, "proposals") === 0),
  topic_proposals: (instance: Instance) => Promise.resolve(rowCount(instance, "proposals") === 0),
  disagreement_proposals: (instance: Instance) =>
    Promise.resolve(rowCount(instance, "proposals") === 0),
} as const satisfies Readonly<
  Record<KindCase["kind"], (instance: Instance, owner: number) => Promise<boolean>>
>;

async function libraryOnBot(instance: Instance, kindCase: KindCase): Promise<number> {
  const owner = await kindCase.library(instance);
  const chosen = await chooseGrokBot(instance);

  assert.equal(chosen.status, 200, chosen.body);

  return owner;
}

describe("with Grok Bot saved as the Provider the production runner counts a kind's attempts as the lifecycle says", () => {
  for (const kindCase of KIND_CASES) {
    it(`${kindCase.kind}: one job goes through three unanswered claims, 30 s then 2 minutes apart, and gives up with the kind's failure`, async () => {
      const instance = await botInstance();

      try {
        const owner = await libraryOnBot(instance, kindCase);
        const opened = await openJobOf(instance, { kind: kindCase.kind, itemId: owner });
        const job = { ...opened, attemptGeneration: generationOf(instance, owner) };

        const first = await unansweredClaim(instance, { kindCase, job });

        await executeClaimed(instance.core, job);

        const afterFirst = jobRow(instance, job.id);

        assert.deepEqual([afterFirst.state, afterFirst.attempts], ["queued", 1]);
        assert.ok(
          Math.abs(afterFirst.next_attempt_at - Date.now() - FIRST_RETRY_MS) < TOLERANCE_MS,
        );
        assert.equal(taskRow(instance, first.id).refusal, "timeout");

        const secondClaim = await claimedAgain(instance, job);
        const second = await unansweredClaim(instance, { kindCase, job: secondClaim });

        await executeClaimed(instance.core, secondClaim);

        const afterSecond = jobRow(instance, job.id);

        assert.deepEqual([afterSecond.state, afterSecond.attempts], ["queued", 2]);
        assert.ok(
          Math.abs(afterSecond.next_attempt_at - Date.now() - SECOND_RETRY_MS) < TOLERANCE_MS,
        );
        assert.equal(taskRow(instance, second.id).refusal, "timeout");

        const thirdClaim = await claimedAgain(instance, job);
        const third = await unansweredClaim(instance, { kindCase, job: thirdClaim });

        await executeClaimed(instance.core, thirdClaim);

        const gaveUp = jobRow(instance, job.id);

        assert.deepEqual([gaveUp.state, gaveUp.attempts], ["done", 3]);
        assert.equal(taskRow(instance, third.id).state, "failed");
        assert.ok(await FAILURE_SHOWN[kindCase.kind](instance, owner));
        assert.equal(
          (await answered(instance, third, { result: kindCase.fits(third.context) })).status,
          409,
        );
      } finally {
        await instance.close();
      }
    });

    it(`${kindCase.kind}: with Grok Bot selected and its key unreadable the job starts no task and does not run the stored Provider`, async () => {
      const instance = await botInstance();

      try {
        const owner = await selectedWithUnreadableKey(instance, kindCase);
        const known = taskRows(instance).length;
        const job = await openJobOf(instance, { kind: kindCase.kind, itemId: owner });

        await executeClaimed(instance.core, job);

        assert.equal(taskRows(instance).length, known);
      } finally {
        await instance.close();
      }
    });

    it(`${kindCase.kind}: an answered third send applies at attempts 2 and costs no attempt`, async () => {
      const instance = await botInstance();

      try {
        const owner = await libraryOnBot(instance, kindCase);
        const job = await openJobOf(instance, { kind: kindCase.kind, itemId: owner, attempts: 2 });

        const sent = await answeredAs(instance, { kindCase, job });

        await executeClaimed(instance.core, job);

        const done = jobRow(instance, job.id);

        assert.deepEqual([done.state, done.attempts], ["done", 2]);
        assert.equal(taskRow(instance, sent.id).state, "done");
        assert.ok(kindCase.wrote(instance, owner));
      } finally {
        await instance.close();
      }
    });
  }
});
