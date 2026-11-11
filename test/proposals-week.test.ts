import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { Instance } from "./instance.ts";
import { SECRET_KEY, exec, paste, rows, saveProvider, until } from "./related-fixtures.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const JobSchema = z.object({ id: z.number(), item_id: z.number(), state: z.string() });

const RunSchema = z.object({ last_run_at: z.number() });

const jobs = (instance: Instance) =>
  rows(
    instance,
    JobSchema,
    "select id, item_id, state from jobs where kind = 'proposals' order by id",
  );

const runs = (instance: Instance) =>
  rows(instance, RunSchema, "select last_run_at from scheduled_runs where task = 'proposals'");

function closeJobs(instance: Instance): void {
  exec(instance, "update jobs set state = 'done', claim_expires = null where kind = 'proposals'");
}

async function seedLibrary(instance: Instance): Promise<number> {
  await paste(instance, "a", { title: "A", tags: ["machine learning", "ml"] });
  await paste(instance, "b", { title: "B", tags: ["machine-learning"] });
  const newest = await paste(instance, "c", { title: "C", tags: ["llm", "llms"] });

  await paste(instance, "d", { title: "No Digest", noDigest: true });

  return newest;
}

describe("the weekly claim with no Provider saved", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await seedLibrary(instance);
  });

  after(() => instance.close());

  it("claims nothing and opens no job, and claims on the first tick after a Provider is saved", async () => {
    await instance.tick();
    assert.deepEqual([runs(instance), jobs(instance)], [[], []]);

    await saveProvider(instance);
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();
    assert.equal(runs(instance).length, 1);
    assert.equal(jobs(instance).length, 1);
  });
});

describe("the weekly claim with a Provider saved and no Digest", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("claims nothing while no Item has a Digest", async () => {
    await instance.tick();
    assert.deepEqual([runs(instance), jobs(instance)], [[], []]);
  });
});

describe("the weekly claim with a Provider saved", () => {
  let instance: Instance;
  let owner: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    owner = await seedLibrary(instance);
    await saveProvider(instance);
  });

  after(() => instance.close());

  const nextTick = async () => {
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();
  };

  it("opens one job owned by the highest-id Item that has a Digest", async () => {
    await nextTick();

    const [job, ...others] = jobs(instance);

    assert.equal(others.length, 0);
    assert.equal(job?.item_id, owner);
    assert.equal(runs(instance).length, 1);
  });

  it("opens none on a second tick in the week", async () => {
    const [claimed] = runs(instance);

    await nextTick();
    assert.equal(jobs(instance).length, 1);
    assert.deepEqual(runs(instance), [claimed]);
  });

  it("opens one more when the claim is 7 days old", async () => {
    closeJobs(instance);
    exec(
      instance,
      "update scheduled_runs set last_run_at = last_run_at - ? where task = 'proposals'",
      WEEK_MS,
    );
    await nextTick();
    assert.equal(jobs(instance).length, 2);
  });

  it("opens one more when the claim is more than 7 days ahead of the clock", async () => {
    closeJobs(instance);
    exec(
      instance,
      "update scheduled_runs set last_run_at = ? where task = 'proposals'",
      Date.now() + WEEK_MS + 60_000,
    );
    await nextTick();
    assert.equal(jobs(instance).length, 3);
    assert.ok((runs(instance)[0]?.last_run_at ?? 0) <= Date.now());
  });

  it("opens no second job and spends the week while the owner Item's job is still open", async () => {
    exec(
      instance,
      "update scheduled_runs set last_run_at = last_run_at - ? where task = 'proposals'",
      WEEK_MS,
    );

    const [old] = runs(instance);

    await nextTick();
    assert.equal(jobs(instance).length, 3);
    assert.ok((runs(instance)[0]?.last_run_at ?? 0) > (old?.last_run_at ?? 0));
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
      jobs(instance).map(({ item_id: itemId }) => itemId),
      [owner],
    );

    assert.equal((await instance.send("DELETE", `/api/items/${String(owner)}`)).status, 204);
    assert.deepEqual(jobs(instance), []);
    assert.deepEqual(
      rows(
        instance,
        z.object({ n: z.number() }),
        "select count(*) as n from ai_tasks where item_id = ?",
        owner,
      ),
      [{ n: 0 }],
    );

    exec(
      instance,
      "update scheduled_runs set last_run_at = last_run_at - ? where task = 'proposals'",
      WEEK_MS,
    );
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();
    assert.equal(jobs(instance).length, 1);
    assert.notEqual(jobs(instance)[0]?.item_id, owner);
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

    const insert =
      "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values ('tag-merge', ?, ?, ?, ?, 1)";

    exec(instance, insert, tagId("llms"), tagId("llm"), "The same concept.", "rejected");
    exec(instance, insert, tagId("machine learning"), tagId("machine-learning"), null, "declined");
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
