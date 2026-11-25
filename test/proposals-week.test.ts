import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { WEEK_MS } from "../src/core/contract/time-units.ts";
import { Instance } from "./instance.ts";
import { seedProposal } from "./proposal-seed.ts";
import {
  SECRET_KEY,
  paste,
  saveProvider,
  until,
  exec,
  rows,
  nextSweep,
} from "./related-fixtures.ts";
import { jobsOf, claims, moveClaimBack, sweptWithClaim } from "./weekly-claim-fixtures.ts";

async function seedLibrary(instance: Instance): Promise<number> {
  await paste(instance, "a", { title: "A", topic: "Game", tags: ["machine learning", "ml"] });
  await paste(instance, "b", { title: "B", topic: "Games", tags: ["machine-learning"] });
  const newest = await paste(instance, "c", { title: "C", topic: "Game", tags: ["llm", "llms"] });

  await paste(instance, "d", { title: "No Digest", noDigest: true });

  return newest;
}

const MODEL_TASKS = ["proposals", "topic_proposals", "disagreement_proposals"] as const;

describe("each weekly model check has its own claim", () => {
  let library: Instance;
  let owner: number;

  before(async () => {
    const withoutDigest = await Instance.start({ secretKey: SECRET_KEY });
    try {
      await withoutDigest.setUp();
      await paste(withoutDigest, "without-digest", { title: "No Digest", noDigest: true });
      await saveProvider(withoutDigest);
      await nextSweep(withoutDigest);
      for (const task of MODEL_TASKS) {
        assert.deepEqual([claims(withoutDigest, task), jobsOf(withoutDigest, task)], [[], []]);
      }
    } finally {
      await withoutDigest.close();
    }

    library = await Instance.start({ secretKey: SECRET_KEY });
    await library.setUp();
    owner = await seedLibrary(library);
    await nextSweep(library);
    for (const task of MODEL_TASKS) {
      assert.deepEqual([claims(library, task), jobsOf(library, task)], [[], []]);
    }

    await saveProvider(library);
    await nextSweep(library);
  });

  after(() => library.close());

  const close = () => {
    exec(
      library,
      "update jobs set state = 'done', claim_expires = null where kind in (?, ?, ?)",
      ...MODEL_TASKS,
    );
  };

  MODEL_TASKS.forEach((task) => {
    it(`claims ${task} only with a saved Provider and a Digest, once per week`, async () => {
      const claimed = claims(library, task);
      const others = MODEL_TASKS.filter((other) => other !== task);
      const otherClaims = () => others.map((other) => claims(library, other));
      const untouched = otherClaims();

      assert.equal(claimed.length, 1);
      assert.deepEqual(
        jobsOf(library, task).map(({ item_id }) => item_id),
        [owner],
      );

      const otherJobs = () => others.map((kind) => jobsOf(library, kind).length);
      const priorJobs = otherJobs();

      close();
      await nextSweep(library);
      assert.equal(jobsOf(library, task).length, 1);
      assert.deepEqual(claims(library, task), claimed);

      close();
      moveClaimBack(library, task);
      await nextSweep(library);
      assert.deepEqual(otherJobs(), priorJobs);
      assert.equal(jobsOf(library, task).length, 2);
      assert.deepEqual(otherClaims(), untouched);

      close();
      exec(
        library,
        "update scheduled_runs set last_run_at = ? where task = ?",
        Date.now() + WEEK_MS + 60_000,
        task,
      );
      await nextSweep(library);
      assert.deepEqual(otherJobs(), priorJobs);
      assert.equal(jobsOf(library, task).length, 3);
      assert.ok((claims(library, task)[0]?.last_run_at ?? Infinity) <= Date.now());

      close();
      exec(library, "delete from scheduled_runs where task = ?", task);
      await nextSweep(library);
      assert.equal(jobsOf(library, task).length, 4);
      assert.deepEqual(otherClaims(), untouched);
      assert.deepEqual(otherJobs(), priorJobs);

      assert.notEqual(jobsOf(library, task).at(-1)?.state, "done");
      moveClaimBack(library, task);
      const old = claims(library, task)[0]?.last_run_at;
      await nextSweep(library);
      assert.equal(jobsOf(library, task).length, 4);
      assert.ok((claims(library, task)[0]?.last_run_at ?? 0) > (old ?? 0));
    });
  });

  MODEL_TASKS.forEach((task) => {
    it(`claims ${task} again exactly one week after its last claim, and not 1 ms before, and when the claim lies exactly one week ahead only 1 ms further`, async () => {
      const held = jobsOf(library, task).length;

      close();
      assert.equal(await sweptWithClaim(library, task, 1 - WEEK_MS), held);
      close();
      assert.equal(await sweptWithClaim(library, task, -WEEK_MS), held + 1);
      close();
      assert.equal(await sweptWithClaim(library, task, WEEK_MS), held + 1);
      close();
      assert.equal(await sweptWithClaim(library, task, WEEK_MS + 1), held + 2);
    });
  });
});

describe("deleting the Item that owns the weekly job", () => {
  let instance: Instance;
  let owner: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    owner = await seedLibrary(instance);
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("removes the open job and the tasks it recorded, and the next week opens one again", async () => {
    await instance.tick();
    assert.deepEqual(
      jobsOf(instance, "proposals").map(({ item_id: itemId }) => itemId),
      [owner],
    );

    const tasks = await until(
      () =>
        rows(
          instance,
          z.object({ id: z.number(), kind: z.string() }),
          "select id, kind from ai_tasks where item_id = ? and kind in ('proposals', 'topic_proposals') order by kind",
          owner,
        ),
      (found) => found.length === 2,
    );
    assert.deepEqual(
      tasks.map(({ kind }) => kind),
      ["proposals", "topic_proposals"],
    );

    assert.equal((await instance.send("DELETE", `/api/items/${String(owner)}`)).status, 204);
    assert.deepEqual(jobsOf(instance, "proposals"), []);
    assert.deepEqual(jobsOf(instance, "topic_proposals"), []);
    for (const task of tasks) {
      assert.deepEqual(
        rows(
          instance,
          z.object({ id: z.number() }),
          "select id from ai_tasks where id = ?",
          task.id,
        ),
        [],
      );
    }
    assert.deepEqual(
      rows(
        instance,
        z.object({ id: z.number() }),
        "select id from ai_tasks where item_id = ?",
        owner,
      ),
      [],
    );

    exec(
      instance,
      "update scheduled_runs set last_run_at = last_run_at - ? where task = 'proposals'",
      WEEK_MS,
    );
    await nextSweep(instance);
    assert.equal(jobsOf(instance, "proposals").length, 1);
    assert.notEqual(jobsOf(instance, "proposals")[0]?.item_id, owner);
  });
});

describe("the run sends no pair that already has a row, whichever way round the row was stored", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await seedLibrary(instance);
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("leaves a rejected and a declined pair out of the task input and sends the pair that has none", async () => {
    const tagId = (name: string): number => {
      const [found] = rows(
        instance,
        z.object({ id: z.number() }),
        "select id from tags where name = ?",
        name,
      );

      assert.ok(found !== undefined, name);

      return found.id;
    };

    const seedDecided = (from: string, into: string, reason: string | null, state: string) =>
      seedProposal(
        instance,
        "tag-merge",
        { fromTagId: tagId(from), intoTagId: tagId(into) },
        { reason, state },
      );

    seedDecided("llms", "llm", "The same concept.", "rejected");
    seedDecided("machine learning", "machine-learning", null, "declined");
    await instance.tick();

    const [task] = await until(
      () =>
        rows(
          instance,
          z.object({ inputs: z.string() }),
          "select inputs from ai_tasks where kind = 'proposals'",
        ),
      (found) => found.length > 0,
    );

    const { pairs } = z
      .object({
        pairs: z.array(z.tuple([z.object({ id: z.number() }), z.object({ id: z.number() })])),
      })
      .parse(JSON.parse(task?.inputs ?? ""));

    const sent = pairs.map((pair) => pair.map(({ id }) => id).toSorted((a, b) => a - b));

    const decided = [
      [tagId("llm"), tagId("llms")],
      [tagId("machine learning"), tagId("machine-learning")],
    ].map((pair) => pair.toSorted((a, b) => a - b));

    assert.equal(sent.length, 1);
    assert.ok(sent.every((pair) => pair.includes(tagId("ml"))));
    assert.deepEqual(
      sent.filter((pair) => decided.some((each) => each.join() === pair.join())),
      [],
    );
  });
});
