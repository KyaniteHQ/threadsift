import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { accept } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { lockedWriter } from "./locked-writer.ts";
import {
  body,
  failureOf,
  gapRows,
  jobOwners,
  overviewJobStatement,
  overviewJobs,
  pasteTopics,
  proposeGap,
  queueOverview,
  rowStates,
  storePage,
} from "./overview-gap-fixtures.ts";
import { SECRET_KEY, exec, saveProvider } from "./related-fixtures.ts";

describe("Accept of an overview-gap row chooses the run's owner from the Topic as it is when the call is made", () => {
  let instance: Instance;
  let made: Readonly<Record<string, readonly number[]>>;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    made = await pasteTopics(instance, {
      Elsewhere: ["e1"],
      Moving: ["m1", "m2"],
      Arrival: ["r1"],
      Origin: ["o1"],
      Queueing: ["q1", "q2"],
      "Single call": ["s1", "s2"],
    });
    await saveProvider(instance);
  });

  after(() => instance.close());

  const moveTo = (itemId: number, topic: string) => {
    exec(
      instance,
      "update items set topic_id = (select id from topics where name = ?) where id = ?",
      topic,
      itemId,
    );
  };

  it("starts the run for the Topic's current newest Item when the newest Item moved to another Topic, and opens none for the other Topic", async () => {
    const [older, newest] = made["Moving"] ?? [];

    assert.ok(older !== undefined && newest !== undefined);

    const id = proposeGap(instance, "Moving");

    moveTo(newest, "Elsewhere");

    const answer = await accept(instance, id);

    assert.equal(answer.status, 200);
    assert.deepEqual(jobOwners(instance), [older]);
    assert.deepEqual(gapRows(instance), []);
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
    const writer = await lockedWriter(instance, [overviewJobStatement(first)]);
    const answer = await accept(instance, id);

    await writer.committed;
    assert.deepEqual([answer.status, answer.body], [409, body("not-current")]);
    assert.equal(overviewJobs(instance).length, jobs.length + 1);
    assert.deepEqual(rowStates(instance).at(-1), [id, "open"]);
    exec(instance, "delete from proposals");
  });

  it("clears the failure marker, starts one run for the newest Item and deletes the row", async () => {
    const [, newest] = made["Single call"] ?? [];

    assert.ok(newest !== undefined);
    storePage(instance, "Single call", { builtFrom: [], failure: "gave-up" });

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
  });
});
