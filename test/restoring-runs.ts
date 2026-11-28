import { claimNextDue, executeClaimed } from "../src/core/compose/jobs.ts";
import { sweepDigests } from "../src/core/kernel/digest-sweep.ts";
import { continueMerges } from "../src/features/wiki/core/merge-accept.ts";
import { weeklyStages } from "../src/features/wiki/core/proposal-kinds.ts";
import { mergeLines } from "./accept-fixtures.ts";
import { botInstance, chooseGrokBot, selectGrokBot } from "./bot-task-fixtures.ts";
import { Instance } from "./instance.ts";
import { paste } from "./library-fixtures.ts";
import { holdLibrary } from "./restore-fixtures.ts";
import { closing, heldThenReleased, ownerLibrary, stagedMerge } from "./restoring-fixtures.ts";

const QUEUED_DIGEST =
  "insert into jobs (kind, item_id, address, state, attempts, next_attempt_at) select 'digest', id, original_url, 'queued', ?, 0 from items where id = ?";

async function setUpInstance(): Promise<Instance> {
  const instance = await Instance.start();

  await instance.setUp();

  return instance;
}

export async function claimedJobs(): Promise<readonly [held: string, released: string]> {
  const instance = await setUpInstance();

  return closing(instance, async () => {
    const id = await paste(instance, "claimed", { title: "Claimed", noDigest: true });

    instance.database.exec(QUEUED_DIGEST, 0, id);

    return heldThenReleased(instance, async () => {
      const job = await claimNextDue(instance.core.db);

      return job === null ? "none" : job.kind;
    });
  });
}

export async function lastAttemptWhileHeld() {
  const instance = await botInstance();

  return closing(instance, async () => {
    const id = await paste(instance, "last", { title: "Last", noDigest: true });

    await selectGrokBot(instance);
    instance.database.exec("delete from jobs where kind = 'digest'");
    instance.database.exec(QUEUED_DIGEST, 2, id);
    const job = await claimNextDue(instance.core.db);

    holdLibrary(instance, "running", null);
    if (job !== null) await executeClaimed(instance.core, job);

    return {
      claimed: job?.kind,
      open: instance.database.rowCount(
        "jobs",
        "kind = 'digest' and state = 'queued' and attempts = 2",
      ),
      failed: instance.database.rowCount("items", "digest_failed = 1"),
    };
  });
}

export async function owedDigestJobs(): Promise<readonly [held: number, released: number]> {
  const instance = await botInstance();

  return closing(instance, async () => {
    await paste(instance, "owed", { title: "Owed", noDigest: true });
    await selectGrokBot(instance);
    instance.database.exec("delete from jobs where kind = 'digest'");

    return heldThenReleased(instance, async () => {
      await sweepDigests(instance.core.db, Date.now());

      return instance.database.rowCount("jobs", "kind = 'digest'");
    });
  });
}

export async function weeklyClaims(): Promise<readonly [held: number, released: number]> {
  const { instance } = await ownerLibrary();

  return closing(instance, () =>
    heldThenReleased(instance, async () => {
      for (const [, run] of weeklyStages(instance.core, Date.now())) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- The sweep runs its stages in order.
        await run();
      }

      return instance.database.rowCount("scheduled_runs");
    }),
  );
}

export async function heldMerge() {
  const instance = await setUpInstance();

  return closing(instance, () => {
    stagedMerge(instance);

    return heldThenReleased(instance, async () => {
      await continueMerges(instance.core);

      return {
        moved: instance.database.rowCount("item_tags", "tag_id = 92"),
        open: instance.database.rowCount(
          "proposals",
          "state = 'accepting' and failed_runs is null and unit_revision = 1",
        ),
        merged: await mergeLines(instance),
      };
    });
  });
}

export async function grokBotWhileHeld() {
  const instance = await botInstance();

  return closing(instance, async () => {
    await selectGrokBot(instance);
    holdLibrary(instance, "running", null);
    const verify = await instance.send("POST", "/api/settings/ai/verify");
    const save = await chooseGrokBot(instance);

    return { verify, save, tasks: instance.database.rowCount("ai_tasks") };
  });
}
