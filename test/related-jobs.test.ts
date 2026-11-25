import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { runJob } from "../src/core/compose/jobs.ts";
import { Instance, SECRET_KEY } from "./instance.ts";
import { jobAfterAttempts, jobRow, dueNow } from "./job-fixtures.ts";
import { paste, saveProvider, until } from "./library-fixtures.ts";
import { entryCount } from "./log-fixtures.ts";
import { pairsOf, seedPair } from "./related-fixtures.ts";
import { firstPickTask, pickJobs, pickTasks } from "./related-pick-fixtures.ts";

function openPicks(instance: Instance, itemId: number): number {
  return pickJobs(instance, itemId).filter(({ state }) => state !== "done").length;
}

describe("the pick job opens only when a Provider is saved, once for each Item, and not for an older Digest", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("opens no job while no Provider is saved", async () => {
    const id = await paste(instance, "without", { title: "No Provider here" });

    assert.deepEqual(pickJobs(instance, id), []);
  });

  it("opens one job after a caller-sent Digest once a Provider is saved, behind the Item's Digest job", async () => {
    const older = await paste(instance, "older", { title: "Before the Provider" });

    await saveProvider(instance);

    const id = await paste(instance, "with", { title: "Quasar lattice" });

    const jobs = instance.database.rows(
      z.object({ id: z.number(), kind: z.string(), state: z.string() }),
      "select id, kind, state from jobs where item_id = ? order by id",
      id,
    );

    assert.deepEqual(
      jobs.map(({ kind }) => kind).filter((kind) => kind !== "topic_overview"),
      ["fetch", "digest", "related_pick"],
    );
    assert.equal(jobs.find(({ kind }) => kind === "digest")?.state, "done");
    assert.deepEqual(pickJobs(instance, older), []);
  });

  it("adds no second job when a Digest lands while a pick is open", async () => {
    const id = await paste(instance, "again", { title: "Again lattice" });

    await firstPickTask(instance, id);
    assert.equal(openPicks(instance, id), 1);

    await paste(instance, "again", { title: "Again lattice, revised" });
    await until(
      "the revised Digest is stored",
      () =>
        instance.database
          .rows(z.object({ title: z.string() }), "select title from digests where item_id = ?", id)
          .map(({ title }) => title),
      (titles) => titles.length === 1 && titles[0] === "Again lattice, revised",
    );
    assert.equal(openPicks(instance, id), 1);
    assert.equal(pickJobs(instance, id).length, 1);
  });
});

describe("a failed pick leaves the earlier set and the Item untouched and records the refusal", () => {
  let instance: Instance;
  let id: number;
  let other: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    id = await paste(instance, "source", { title: "Quasar lattice decoder", tags: ["quasar"] });
    other = await paste(instance, "other", { title: "Quasar lattice", tags: ["quasar"] });
    seedPair(instance, id, other, 0, "An earlier reason");
    await saveProvider(instance);
    id = await paste(instance, "source", { title: "Quasar lattice decoder", tags: ["quasar"] });
  });

  after(() => instance.close());

  it("fails the AI task, keeps the set, leaves the Item ready and writes no related entry", async () => {
    const task = await firstPickTask(instance, id);

    assert.equal(task.state, "failed");
    assert.equal(task.refusal, "unreachable");
    assert.deepEqual(pairsOf(instance, id), [
      { item_id: id, related_id: other, position: 0, reason: "An earlier reason" },
    ]);
    assert.equal((await instance.settledItem(id)).status, "ready");
    assert.equal(openPicks(instance, id), 1);
    assert.equal(entryCount(instance, "related"), 0);
  });

  it("waits behind the Item's open Digest job and runs after it ends", async () => {
    const first = await firstPickTask(instance, id);
    const [job] = pickJobs(instance, id);
    assert.ok(job);
    const digestOpen = () =>
      instance.database.count(
        "select count(*) as n from jobs where kind = 'digest' and item_id = ? and state <> 'done'",
        id,
      );

    assert.equal((await instance.send("POST", `/api/items/${String(id)}/digest`)).status, 200);
    dueNow(instance, job.id);
    await runJob(instance.core, job.id);

    assert.equal(digestOpen(), 1);
    const held = jobRow(instance, job.id);
    assert.deepEqual([held.state, held.attempts], ["queued", job.attempts]);
    const tasks = () => pickTasks(instance, id).map(({ id: taskId }) => taskId);
    assert.deepEqual(tasks(), [first.id]);

    await paste(instance, "source", { title: "Quasar lattice decoder", tags: ["quasar"] });
    assert.equal(digestOpen(), 0);
    await runJob(instance.core, job.id);
    const [earlier, later] = await until(
      "two Related pick tasks exist",
      tasks,
      (ids) => ids.length === 2,
    );
    assert.deepEqual(
      pickJobs(instance, id).map(({ id: pickId }) => pickId),
      [job.id],
    );
    await jobAfterAttempts(instance, job.id, held.attempts + 1);
    assert.equal(earlier, first.id);
    assert.ok(later !== undefined && later > first.id);
  });
});

describe("an Item with no term or no candidate gets an empty set and makes no AI task", () => {
  let instance: Instance;
  let noTerm: number;
  let noCandidate: number;
  let neighbour: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    neighbour = await paste(instance, "neighbour", { title: "Neighbour" });
    noTerm = await paste(instance, "no-term", { title: "!!!", tags: ["?"] });
    noCandidate = await paste(instance, "no-candidate", { title: "Zyxwvut" });
    seedPair(instance, noTerm, neighbour, 0, "An earlier reason");
    seedPair(instance, noCandidate, neighbour, 0, "An earlier reason");
    await saveProvider(instance);
    await paste(instance, "no-term", { title: "!!!", tags: ["?"] });
    await paste(instance, "no-candidate", { title: "Zyxwvut" });
  });

  after(() => instance.close());

  it("clears the seeded earlier set, closes the job and writes no related entry for the empty set", async () => {
    await until(
      "neither Item has Related Items",
      () => [pairsOf(instance, noTerm).length, pairsOf(instance, noCandidate).length],
      (counts) => counts.every((each) => each === 0),
    );
    await until(
      "neither Item has an open Related pick",
      () => [openPicks(instance, noTerm), openPicks(instance, noCandidate)],
      (counts) => counts.every((each) => each === 0),
    );
    assert.deepEqual(pickTasks(instance, noTerm), []);
    assert.deepEqual(pickTasks(instance, noCandidate), []);
    assert.equal(entryCount(instance, "related"), 0);
  });
});
