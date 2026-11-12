import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { accept } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { interrupted, touchesProposals } from "./interrupted-database.ts";
import {
  body,
  failureOf,
  gapRows,
  jobOwners,
  overviewJobs,
  pasteTopics,
  proposeGap,
  queueOverview,
  rowStates,
  storePage,
} from "./overview-gap-fixtures.ts";
import { SECRET_KEY, exec, saveProvider } from "./related-fixtures.ts";
import { holdLease, topicId } from "./topic-accept-fixtures.ts";

const GUARDED_BATCH = 3;

describe("Accept of an overview-gap row chooses the run's owner inside its guarded batch", () => {
  let instance: Instance;
  let made: Readonly<Record<string, readonly number[]>>;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    made = await pasteTopics(instance, {
      Elsewhere: ["e1"],
      Moving: ["m1", "m2"],
      Leaving: ["l1", "l2"],
      Arrival: ["r1"],
      Origin: ["o1"],
      Queueing: ["q1", "q2"],
      Unprovided: ["u1"],
      "Single call": ["s1", "s2"],
      Flipping: ["f1", "f2"],
    });
    await saveProvider(instance);
  });

  after(() => instance.close());

  const acceptWith = (id: number, hook: (call: number) => Promise<void>) =>
    instance.sendThrough(
      interrupted(instance.databaseFile, touchesProposals, { before: hook }),
      "POST",
      `/api/proposals/${String(id)}/accept`,
    );

  const acceptBetween = (id: number, between: () => void) =>
    acceptWith(id, (call) => {
      if (call === GUARDED_BATCH) between();

      return Promise.resolve();
    });

  const moveTo = (itemId: number, topic: string) => () => {
    exec(
      instance,
      "update items set topic_id = (select id from topics where name = ?) where id = ?",
      topic,
      itemId,
    );
  };

  it("starts the run for the Topic's current newest Item when the newest Item moved to another Topic after the row was read, and opens none for the other Topic", async () => {
    const [older, newest] = made["Moving"] ?? [];

    assert.ok(older !== undefined && newest !== undefined);

    const id = proposeGap(instance, "Moving");
    const answer = await acceptBetween(id, moveTo(newest, "Elsewhere"));

    assert.equal(answer.status, 200);
    assert.deepEqual(jobOwners(instance), [older]);
    assert.deepEqual(gapRows(instance), []);
  });

  it("answers not-current and starts nothing when the Topic's last uncovered Item moves away", async () => {
    const [built, uncovered] = made["Leaving"] ?? [];

    assert.ok(built !== undefined && uncovered !== undefined);
    storePage(instance, "Leaving", { builtFrom: [built], failure: "gave-up" });

    const id = proposeGap(instance, "Leaving");
    const jobs = overviewJobs(instance);
    const answer = await acceptBetween(id, moveTo(uncovered, "Elsewhere"));

    assert.deepEqual([answer.status, answer.body], [409, body("not-current")]);
    assert.deepEqual(overviewJobs(instance), jobs);
    assert.equal(failureOf(instance, "Leaving"), "gave-up");
    assert.deepEqual(rowStates(instance).at(-1), [id, "open"]);
    exec(instance, "delete from proposals");
  });

  it("answers not-current when the newest Item arrived with a run still open from its old Topic, and inserts nothing silently", async () => {
    const [arriving] = made["Origin"] ?? [];

    assert.ok(arriving !== undefined);
    queueOverview(instance, arriving);
    exec(
      instance,
      "update items set topic_id = (select id from topics where name = 'Arrival'), saved_at = 9999999999999 where id = ?",
      arriving,
    );

    const id = proposeGap(instance, "Arrival");
    const jobs = overviewJobs(instance);
    const answer = await accept(instance, id);

    assert.deepEqual([answer.status, answer.body], [409, body("not-current")]);
    assert.deepEqual(overviewJobs(instance), jobs);
    assert.deepEqual(rowStates(instance).at(-1), [id, "open"]);
    exec(instance, "delete from proposals");
  });

  it("answers not-current when a run is queued on another Item of the Topic after the row was read", async () => {
    const [first] = made["Queueing"] ?? [];

    assert.ok(first !== undefined);

    const id = proposeGap(instance, "Queueing");
    const jobs = overviewJobs(instance);

    const answer = await acceptBetween(id, () => {
      queueOverview(instance, first);
    });

    assert.deepEqual([answer.status, answer.body], [409, body("not-current")]);
    assert.equal(overviewJobs(instance).length, jobs.length + 1);
    assert.deepEqual(rowStates(instance).at(-1), [id, "open"]);
    exec(instance, "delete from proposals");
  });

  it("answers no-provider when the Provider is removed after the row was read, and changes nothing", async () => {
    const id = proposeGap(instance, "Unprovided");
    const jobs = overviewJobs(instance);

    const answer = await acceptBetween(id, () => {
      exec(instance, "delete from settings");
    });

    assert.deepEqual([answer.status, answer.body], [409, body("no-provider")]);
    assert.deepEqual(overviewJobs(instance), jobs);
    assert.deepEqual(rowStates(instance).at(-1), [id, "open"]);
    exec(instance, "delete from proposals");
    await saveProvider(instance);
  });

  it("clears the failure marker, starts one run for the newest Item and deletes the row while another holder owns the Topic lease", async () => {
    const [, newest] = made["Single call"] ?? [];

    assert.ok(newest !== undefined);
    storePage(instance, "Single call", { builtFrom: [], failure: "gave-up" });
    holdLease(instance, topicId(instance, "Single call"), "someone-else");

    const id = proposeGap(instance, "Single call");
    const owners = jobOwners(instance);
    const answer = await accept(instance, id);

    assert.equal(answer.status, 200);
    assert.deepEqual(jobOwners(instance), [...owners, newest]);
    assert.equal(failureOf(instance, "Single call"), null);
    assert.deepEqual(
      gapRows(instance).filter((row) => row.id === id),
      [],
    );
    exec(instance, "delete from topic_leases");
  });

  it("answers 200 and starts the run when the Provider returns between the refused batch and its recheck", async () => {
    const [, newest] = made["Flipping"] ?? [];

    assert.ok(newest !== undefined);

    const id = proposeGap(instance, "Flipping");
    const owners = jobOwners(instance);

    const answer = await acceptWith(id, async (call) => {
      if (call === GUARDED_BATCH) exec(instance, "delete from settings");

      if (call === GUARDED_BATCH + 1) await saveProvider(instance);
    });

    assert.equal(answer.status, 200);
    assert.deepEqual(jobOwners(instance), [...owners, newest]);
    assert.deepEqual(
      gapRows(instance).filter((row) => row.id === id),
      [],
    );
  });
});
