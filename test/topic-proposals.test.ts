import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { Instance } from "./instance.ts";
import { SECRET_KEY, exec, paste, rows, saveProvider, until } from "./related-fixtures.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const JobSchema = z.object({ id: z.number(), item_id: z.number(), state: z.string() });

const RunSchema = z.object({ last_run_at: z.number() });

const jobsOf = (instance: Instance, kind: string) =>
  rows(instance, JobSchema, "select id, item_id, state from jobs where kind = ? order by id", kind);

const runOf = (instance: Instance, task: string) =>
  rows(instance, RunSchema, "select last_run_at from scheduled_runs where task = ?", task);

const nextTick = async (instance: Instance) => {
  exec(instance, "delete from scheduled_runs where task = 'sweep'");
  await instance.tick();
};

function closeJobs(instance: Instance): void {
  exec(instance, "update jobs set state = 'done', claim_expires = null");
}

async function seedTopics(instance: Instance): Promise<number> {
  await paste(instance, "a", { title: "A", topic: "Machine learning" });
  await paste(instance, "b", { title: "B", topic: "machine-learning" });
  await paste(instance, "c", { title: "C", topic: "ML" });
  const newest = await paste(instance, "d", { title: "D", topic: "Games" });

  await paste(instance, "e", { title: "No Digest", noDigest: true });

  return newest;
}

describe("the weekly Topic claim with no Provider saved", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await seedTopics(instance);
  });

  after(() => instance.close());

  it("claims nothing, and claims on the first tick after a Provider is saved", async () => {
    await instance.tick();
    assert.deepEqual(
      [runOf(instance, "topic_proposals"), jobsOf(instance, "topic_proposals")],
      [[], []],
    );

    await saveProvider(instance);
    await nextTick(instance);
    assert.equal(runOf(instance, "topic_proposals").length, 1);
    assert.equal(jobsOf(instance, "topic_proposals").length, 1);
  });
});

describe("the weekly Topic claim with a Provider saved", () => {
  let instance: Instance;
  let owner: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    owner = await seedTopics(instance);
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("opens one job owned by the highest-id Item that has a Digest, beside the Tag job", async () => {
    await nextTick(instance);

    assert.deepEqual(
      jobsOf(instance, "topic_proposals").map(({ item_id: itemId }) => itemId),
      [owner],
    );
    assert.deepEqual(
      jobsOf(instance, "proposals").map(({ item_id: itemId }) => itemId),
      [owner],
    );
  });

  it("opens none on a second tick in the week", async () => {
    const [claimed] = runOf(instance, "topic_proposals");

    await nextTick(instance);
    assert.equal(jobsOf(instance, "topic_proposals").length, 1);
    assert.deepEqual(runOf(instance, "topic_proposals"), [claimed]);
  });

  it("opens one more when its claim is 7 days old, and leaves the Tag claim alone", async () => {
    closeJobs(instance);

    const [tagClaim] = runOf(instance, "proposals");

    exec(
      instance,
      "update scheduled_runs set last_run_at = last_run_at - ? where task = 'topic_proposals'",
      WEEK_MS,
    );
    await nextTick(instance);
    assert.equal(jobsOf(instance, "topic_proposals").length, 2);
    assert.equal(jobsOf(instance, "proposals").length, 1);
    assert.deepEqual(runOf(instance, "proposals"), [tagClaim]);
  });

  it("opens the Topic job while the Tag claim stays spent", async () => {
    closeJobs(instance);
    exec(instance, "delete from scheduled_runs where task = 'topic_proposals'");
    await nextTick(instance);
    assert.equal(jobsOf(instance, "topic_proposals").length, 3);
    assert.equal(jobsOf(instance, "proposals").length, 1);
  });
});

describe("the Topic job's input and its owner Item", () => {
  let instance: Instance;
  let owner: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await paste(instance, "a", { title: "A", topic: "Machine learning" });
    await paste(instance, "b", { title: "B", topic: "machine-learning" });
    await paste(instance, "c", { title: "C", topic: "ML" });
    await paste(instance, "d", { title: "D", topic: "Games" });
    await paste(instance, "e", { title: "E", topic: "Puzzle" });
    await paste(instance, "f", { title: "F", topic: "Puzzle" });
    await paste(instance, "g", { title: "G", topic: "Puzzles" });
    owner = await paste(instance, "h", { title: "H", topic: "Puzzles" });
    await saveProvider(instance);
  });

  after(() => instance.close());

  const topicId = (name: string): number => {
    const [found] = rows(
      instance,
      z.object({ id: z.number() }),
      "select id from topics where name = ?",
      name,
    );

    assert.ok(found !== undefined, name);

    return found.id;
  };

  it("sends the undecided pairs, most used first, and leaves out a Topic with no Item and both decided pairs", async () => {
    exec(instance, "insert into topics (key, name) values ('game', 'Game')");

    const insert =
      "insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) values ('topic-merge', ?, ?, ?, ?, 1)";

    exec(
      instance,
      insert,
      topicId("ML"),
      topicId("Machine learning"),
      "The same subject.",
      "rejected",
    );
    exec(
      instance,
      insert,
      topicId("machine-learning"),
      topicId("Machine learning"),
      null,
      "declined",
    );
    await instance.tick();

    const [task] = await until(
      () =>
        rows(
          instance,
          z.object({ inputs: z.string(), item_id: z.number() }),
          "select inputs, item_id from ai_tasks where kind = 'topic_proposals'",
        ),
      (found) => found.length > 0,
    );

    const { pairs } = z
      .object({
        pairs: z.array(
          z.tuple([
            z.object({ id: z.number(), items: z.number(), tags: z.array(z.string()) }),
            z.object({ id: z.number(), items: z.number(), tags: z.array(z.string()) }),
          ]),
        ),
      })
      .parse(JSON.parse(task?.inputs ?? ""));

    assert.equal(task?.item_id, owner);
    assert.deepEqual(
      pairs.map((pair) => pair.map(({ id }) => id)),
      [
        [topicId("Puzzle"), topicId("Puzzles")],
        [topicId("machine-learning"), topicId("ML")],
      ],
    );
    assert.deepEqual(
      pairs.map((pair) => pair.map(({ items }) => items)),
      [
        [2, 2],
        [1, 1],
      ],
    );
  });

  it("removes the open job and its task when its owner Item is deleted", async () => {
    assert.equal((await instance.send("DELETE", `/api/items/${String(owner)}`)).status, 204);
    assert.deepEqual(jobsOf(instance, "topic_proposals"), []);
    assert.deepEqual(
      rows(
        instance,
        z.object({ n: z.number() }),
        "select count(*) as n from ai_tasks where item_id = ? and kind = 'topic_proposals'",
        owner,
      ),
      [{ n: 0 }],
    );
  });
});
