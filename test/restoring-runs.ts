import { claimNextDue } from "../src/core/compose/jobs.ts";
import { sweepDigests } from "../src/core/kernel/digest-opening.ts";
import { continueMerges } from "../src/features/wiki/core/merge-accept.ts";
import { weeklyStages } from "../src/features/wiki/core/proposal-kinds.ts";
import { mergeLines } from "./accept-fixtures.ts";
import { botInstance, selectGrokBot } from "./bot-task-fixtures.ts";
import { Instance, type Answer } from "./instance.ts";
import { paste } from "./library-fixtures.ts";
import { holdLibrary } from "./restore-fixtures.ts";
import { heldThenReleased, ownerLibrary, stagedMerge } from "./restoring-fixtures.ts";

export async function claimedJobs(): Promise<readonly [held: string, released: string]> {
  const instance = await Instance.start();

  await instance.setUp();
  const id = await paste(instance, "claimed", { title: "Claimed", noDigest: true });

  instance.database.exec(
    "insert into jobs (kind, item_id, address, state, attempts, next_attempt_at) select 'digest', id, original_url, 'queued', 0, 0 from items where id = ?",
    id,
  );
  const claimed = await heldThenReleased(instance, async () => {
    const job = await claimNextDue(instance.core.db);

    return job === null ? "none" : job.kind;
  });

  await instance.close();

  return claimed;
}

export async function owedDigestJobs(): Promise<readonly [held: number, released: number]> {
  const instance = await botInstance();

  await paste(instance, "owed", { title: "Owed", noDigest: true });
  await selectGrokBot(instance);
  instance.database.exec("delete from jobs where kind = 'digest'");
  const opened = await heldThenReleased(instance, async () => {
    await sweepDigests(instance.core.db, Date.now());

    return instance.database.rowCount("jobs", "kind = 'digest'");
  });

  await instance.close();

  return opened;
}

export async function weeklyClaims(): Promise<readonly [held: number, released: number]> {
  const { instance } = await ownerLibrary();
  const claims = await heldThenReleased(instance, async () => {
    for (const [, run] of weeklyStages(instance.core, Date.now())) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- The sweep runs its stages in order.
      await run();
    }

    return instance.database.rowCount("scheduled_runs");
  });

  await instance.close();

  return claims;
}

export async function heldMerge() {
  const instance = await Instance.start();

  await instance.setUp();
  stagedMerge(instance);
  const state = () => ({
    moved: instance.database.rowCount("item_tags", "tag_id = 92"),
    open: instance.database.rowCount(
      "proposals",
      "state = 'accepting' and failed_runs is null and unit_revision = 1",
    ),
  });
  const runs = await heldThenReleased(instance, async () => {
    await continueMerges(instance.core);

    return { ...state(), merged: await mergeLines(instance) };
  });

  await instance.close();

  return runs;
}

export async function grokBotVerify(): Promise<readonly [answer: Answer, tasks: number]> {
  const instance = await botInstance();

  await selectGrokBot(instance);
  holdLibrary(instance, "running", null);
  const answer = await instance.send("POST", "/api/settings/ai/verify");
  const tasks = instance.database.rowCount("ai_tasks");

  await instance.close();

  return [answer, tasks];
}
