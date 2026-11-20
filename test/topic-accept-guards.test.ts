import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { continueMerges } from "../src/features/wiki/core/merge-accept.ts";
import { count } from "./accept-fixtures.ts";
import type { Instance } from "./instance.ts";
import { interrupted } from "./interrupted-database.ts";
import { exec } from "./related-fixtures.ts";
import { itemsOf, topicMergeLines, withLibrary } from "./topic-accept-fixtures.ts";

const acceptBetween = (instance: Instance, proposal: number, write: () => void) =>
  instance.sendThrough(
    interrupted(instance.databaseFile, (sql) => sql.startsWith('insert into "guards"'), {
      before: (call) => {
        if (call === 1) write();

        return Promise.resolve();
      },
    }),
    "POST",
    `/api/proposals/${String(proposal)}/accept`,
  );

describe("a Topic unit writes nothing when the row it read no longer matches the row", () => {
  it("reads the row again and merges into the new target when the row is repointed between the read and the batch", () =>
    withLibrary(async ({ instance, loser, survivor, third, proposal }) => {
      const answer = await acceptBetween(instance, proposal, () => {
        exec(instance, "update proposals set into_topic_id = ? where id = ?", third, proposal);
      });

      assert.equal(answer.status, 200);
      assert.equal(itemsOf(instance, third), 4);
      assert.equal(itemsOf(instance, survivor), 1);
      assert.equal(count(instance, "select count(*) as n from topics where id = ?", loser), 0);
      assert.deepEqual(await topicMergeLines(instance), ["Loser into Third | 3 Items"]);
    }));
});

describe("a Topic that a key step deleted after the row was read", () => {
  it("answers 404 when the merged-away Topic is deleted before the batch", () =>
    withLibrary(
      async ({ instance, loser, survivor, proposal }) => {
        assert.ok(survivor < loser);
        exec(instance, "update items set topic_id = ? where topic_id = ?", survivor, loser);
        exec(instance, "update log_entries set topic_id = ? where topic_id = ?", survivor, loser);

        const answer = await acceptBetween(instance, proposal, () => {
          exec(instance, "delete from topics where id = ?", loser);
        });

        assert.equal(answer.status, 404);

        assert.equal(count(instance, "select count(*) as n from proposals"), 0);
      },
      { loserFirst: false },
    ));
});

describe("a Topic merge whose unit revision keeps moving", () => {
  it("leaves the row accepting and moves nothing until a runner can hold its read revision", () =>
    withLibrary(async ({ instance, loser, proposal }) => {
      exec(
        instance,
        "update proposals set state = 'accepting', moved = 0, unit_revision = 1 where id = ?",
        proposal,
      );

      const db = interrupted(
        instance.databaseFile,
        (sql) => sql.startsWith('insert into "guards"'),
        {
          before: () => {
            exec(
              instance,
              "update proposals set unit_revision = unit_revision + 1 where id = ?",
              proposal,
            );

            return Promise.resolve();
          },
        },
      );

      await continueMerges({ ...instance.core, db });

      assert.equal(
        count(
          instance,
          "select count(*) as n from proposals where id = ? and state = 'accepting'",
          proposal,
        ),
        1,
      );
      assert.equal(itemsOf(instance, loser), 3);
      assert.equal(count(instance, "select count(*) as n from pins"), 0);
      assert.deepEqual(await topicMergeLines(instance), []);
      await continueMerges(instance.core);
      assert.equal(
        count(instance, "select count(*) as n from proposals where id = ?", proposal),
        0,
      );
      assert.deepEqual(await topicMergeLines(instance), ["Loser into Survivor | 3 Items"]);
    }));
});

describe("a Topic merge whose Proposal or keys change before the batch", () => {
  it("answers 404 and moves nothing when the Proposal was deleted after the read", () =>
    withLibrary(async ({ instance, loser, proposal }) => {
      const answer = await acceptBetween(instance, proposal, () => {
        exec(instance, "delete from proposals where id = ?", proposal);
      });

      assert.equal(answer.status, 404);
      assert.equal(itemsOf(instance, loser), 3);
      assert.equal(count(instance, "select count(*) as n from pins"), 0);
      assert.deepEqual(await topicMergeLines(instance), []);
    }));

  it("reads the renamed loser's key and name before storing its Pin and Log entry", () =>
    withLibrary(async ({ instance, loser, proposal }) => {
      const answer = await acceptBetween(instance, proposal, () => {
        exec(
          instance,
          "update topics set key = 'renamed loser', name = 'Renamed loser' where id = ?",
          loser,
        );
      });

      assert.equal(answer.status, 200);
      assert.equal(
        count(
          instance,
          "select count(*) as n from pins where from_key = 'renamed loser' and from_name = 'Renamed loser'",
        ),
        1,
      );
      assert.deepEqual(await topicMergeLines(instance), ["Renamed loser into Survivor | 3 Items"]);
    }));

  it("reads the renamed survivor's key and name before recording the merge", () =>
    withLibrary(async ({ instance, survivor, proposal }) => {
      const answer = await acceptBetween(instance, proposal, () => {
        exec(
          instance,
          "update topics set key = 'renamed survivor', name = 'Renamed survivor' where id = ?",
          survivor,
        );
      });

      assert.equal(answer.status, 200);
      assert.equal(itemsOf(instance, survivor), 4);
      assert.deepEqual(await topicMergeLines(instance), ["Loser into Renamed survivor | 3 Items"]);
    }));
});
