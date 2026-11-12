import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { accept, count } from "./accept-fixtures.ts";
import { script } from "./pin-fixtures.ts";
import { exec, rows } from "./related-fixtures.ts";
import {
  heldLeases,
  itemsOf,
  leaseGeneration,
  answerOf,
  topicMergeLines,
  withLibrary,
} from "./topic-accept-fixtures.ts";

const ClaimSchema = z.object({ topic_id: z.number() });

const claimOrder = (instance: Parameters<typeof rows>[0]): readonly number[] =>
  rows(instance, ClaimSchema, "select topic_id from test_claims order by rowid").map(
    ({ topic_id: id }) => id,
  );

describe("a Topic unit claims its two leases in ascending Topic id", () => {
  it("claims the lower id first when the merged-away Topic has the higher id", () =>
    withLibrary(
      async ({ instance, loser, survivor, proposal }) => {
        assert.ok(survivor < loser);
        script(
          instance,
          "create table test_claims (topic_id integer); create trigger test_claim after insert on topic_leases when new.holder like 'topic_merge:%' begin insert into test_claims values (new.topic_id); end;",
        );

        assert.deepEqual(await answerOf(instance, proposal), [200, { state: "done" }]);
        assert.deepEqual(claimOrder(instance), [survivor, loser]);
      },
      { loserFirst: false },
    ));

  it("claims the lower id first when the merged-away Topic has the lower id", () =>
    withLibrary(async ({ instance, loser, survivor, proposal }) => {
      assert.ok(loser < survivor);
      script(
        instance,
        "create table test_claims (topic_id integer); create trigger test_claim after insert on topic_leases when new.holder like 'topic_merge:%' begin insert into test_claims values (new.topic_id); end;",
      );

      assert.deepEqual(await answerOf(instance, proposal), [200, { state: "done" }]);
      assert.deepEqual(claimOrder(instance), [loser, survivor]);
    }));
});

describe("a Topic unit writes nothing when the row it read no longer matches the row", () => {
  it("reads the row again and merges into the new target when the row is repointed between the claims and the batch", () =>
    withLibrary(async ({ instance, loser, survivor, third, proposal }) => {
      script(
        instance,
        `create trigger test_repoint after insert on topic_leases when new.topic_id = ${String(survivor)} begin update proposals set into_topic_id = ${String(third)} where id = ${String(proposal)}; end;`,
      );

      assert.deepEqual(await answerOf(instance, proposal), [200, { state: "done" }]);
      assert.equal(itemsOf(instance, third), 4);
      assert.equal(itemsOf(instance, survivor), 1);
      assert.equal(count(instance, "select count(*) as n from topics where id = ?", loser), 0);
      assert.deepEqual(await topicMergeLines(instance), ["Loser into Third | 3 Items"]);
      assert.equal(heldLeases(instance), 0);
    }));

  it("reads the row again and runs a second unit when a key step renames the merged-away Topic between the claims and the batch", () =>
    withLibrary(async ({ instance, loser, survivor, proposal }) => {
      script(
        instance,
        `create trigger test_rename after insert on topic_leases when new.topic_id = ${String(survivor)} begin update topics set key = 'renamed by a key step' where id = ${String(loser)}; end;`,
      );

      assert.deepEqual(await answerOf(instance, proposal), [200, { state: "done" }]);
      assert.equal(leaseGeneration(instance, survivor), 2);
      assert.equal(itemsOf(instance, survivor), 4);
      assert.equal(heldLeases(instance), 0);
    }));

  it("reads the row again and runs a second unit when a key step renames the survivor between the claims and the batch", () =>
    withLibrary(async ({ instance, survivor, proposal }) => {
      script(
        instance,
        `create trigger test_rename_survivor after insert on topic_leases when new.topic_id = ${String(survivor)} begin update topics set key = 'renamed survivor' where id = ${String(survivor)}; end;`,
      );

      assert.deepEqual(await answerOf(instance, proposal), [200, { state: "done" }]);
      assert.equal(leaseGeneration(instance, survivor), 2);
      assert.equal(itemsOf(instance, survivor), 4);
      assert.equal(heldLeases(instance), 0);
    }));
});

describe("a Topic that a key step deleted after the row was read", () => {
  it("answers 404 and holds no lease when the merged-away Topic is deleted between the two claims", () =>
    withLibrary(
      async ({ instance, loser, survivor, proposal }) => {
        assert.ok(survivor < loser);
        exec(instance, "update items set topic_id = ? where topic_id = ?", survivor, loser);
        exec(instance, "update log_entries set topic_id = ? where topic_id = ?", survivor, loser);
        script(
          instance,
          `create trigger test_gone after insert on topic_leases when new.topic_id = ${String(survivor)} begin delete from topics where id = ${String(loser)}; end;`,
        );

        assert.equal((await accept(instance, proposal)).status, 404);
        assert.equal(heldLeases(instance), 0);
        assert.equal(count(instance, "select count(*) as n from proposals"), 0);
      },
      { loserFirst: false },
    ));
});
