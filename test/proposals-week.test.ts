import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { jobsOf } from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { claims, moveClaimBack, nextTick, WEEK_MS } from "./lost-highlight-fixtures.ts";
import { seedProposal } from "./proposal-seed.ts";
import { SECRET_KEY, exec, paste, rows, saveProvider, until } from "./related-fixtures.ts";

async function seedLibrary(instance: Instance): Promise<number> {
  await paste(instance, "a", { title: "A", topic: "Game", tags: ["machine learning", "ml"] });
  await paste(instance, "b", { title: "B", topic: "Games", tags: ["machine-learning"] });
  const newest = await paste(instance, "c", { title: "C", tags: ["llm", "llms"] });

  await paste(instance, "d", { title: "No Digest", noDigest: true });

  return newest;
}

const MODEL_TASKS = ["proposals", "topic_proposals", "disagreement_proposals"] as const;

describe("each weekly model check has its own claim", () => {
  for (const task of MODEL_TASKS) {
    it(`claims ${task} only with a saved Provider and a Digest, once per week`, async (t) => {
      const instance = await Instance.start({ secretKey: SECRET_KEY });

      t.after(() => instance.close());
      await instance.setUp();
      await saveProvider(instance);
      await nextTick(instance);
      assert.deepEqual([claims(instance, task), jobsOf(instance, task)], [[], []]);

      const library = await Instance.start({ secretKey: SECRET_KEY });

      t.after(() => library.close());
      await library.setUp();
      const owner = await seedLibrary(library);

      await nextTick(library);
      assert.deepEqual([claims(library, task), jobsOf(library, task)], [[], []]);

      await saveProvider(library);
      await nextTick(library);
      const claimed = claims(library, task);
      const others = MODEL_TASKS.filter((other) => other !== task);
      const otherClaims = () => others.map((other) => claims(library, other));
      const untouched = otherClaims();

      assert.equal(claimed.length, 1);
      for (const kind of MODEL_TASKS) {
        assert.deepEqual(
          jobsOf(library, kind).map(({ item_id }) => item_id),
          [owner],
        );
      }

      const close = () => {
        exec(library, "update jobs set state = 'done', claim_expires = null where kind = ?", task);
      };

      close();
      await nextTick(library);
      assert.equal(jobsOf(library, task).length, 1);
      assert.deepEqual(claims(library, task), claimed);

      moveClaimBack(library, task);
      await nextTick(library);
      assert.equal(jobsOf(library, task).length, 2);
      assert.deepEqual(otherClaims(), untouched);

      close();
      exec(
        library,
        "update scheduled_runs set last_run_at = ? where task = ?",
        Date.now() + WEEK_MS + 60_000,
        task,
      );
      await nextTick(library);
      assert.equal(jobsOf(library, task).length, 3);
      assert.ok((claims(library, task)[0]?.last_run_at ?? Infinity) <= Date.now());

      close();
      exec(library, "delete from scheduled_runs where task = ?", task);
      await nextTick(library);
      assert.equal(jobsOf(library, task).length, 4);
      assert.deepEqual(otherClaims(), untouched);
      assert.deepEqual(
        others.map((kind) => jobsOf(library, kind).length),
        [1, 1],
      );

      if (task === "proposals") {
        moveClaimBack(library, task);
        const old = claims(library, task)[0]?.last_run_at;
        await nextTick(library);
        assert.equal(jobsOf(library, task).length, 4);
        assert.ok((claims(library, task)[0]?.last_run_at ?? 0) > (old ?? 0));
      }
    });
  }
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
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();
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
        { from_tag_id: tagId(from), into_tag_id: tagId(into) },
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
