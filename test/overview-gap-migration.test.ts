import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { Instance } from "./instance.ts";
import { readPage } from "./lost-highlight-fixtures.ts";
import { type OlderRelease, startOlderRelease } from "./older-release.ts";
import { gapsOf } from "./overview-gap-fixtures.ts";

const OVERVIEW_MIGRATION = "0045_overview-gap-proposals.sql";

const SEED = `
  insert into topics (id, key, name) values (1, 'x', 'X'), (2, 'y', 'Y'), (3, 'z', 'Z');
  insert into items (id, source, kind, normalized_url, original_url, saved_at, topic_id) values
    (1, 'article', 'article', 'u1', 'u1', 1, 1), (2, 'article', 'article', 'u2', 'u2', 2, 2);
  insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id) values
    (1, 'digest', '{}', 0, 'caller', 1, 0, 'done', 1), (2, 'digest', '{}', 0, 'caller', 1, 0, 'done', 2);
  insert into digests (item_id, digest, title, topic, task_id, generation, created_at) values
    (1, '{}', 'One', 'X', 1, 0, 1), (2, '{}', 'Two', 'Y', 2, 0, 1);
  insert into highlights (id, item_id, exact, prefix, suffix, hint, projection, created_at, status, start) values
    (1, 1, 'one', '', '', 0, 1, 1, 'gone', null);
  insert into tags (id, key, name) values (1, 'a', 'A'), (2, 'b', 'B'), (3, 'c', 'C');
  insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at, cursor, moved, unit_revision) values
    ('tag-merge', 1, 2, 'Open.', 'open', 1, null, null, null),
    ('tag-merge', 2, 3, 'Accepting.', 'accepting', 2, 40, 12, 3),
    ('tag-merge', 3, 1, null, 'declined', 3, null, null, null);
  insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) values
    ('topic-merge', 1, 2, 'Open topic.', 'open', 4),
    ('topic-merge', 2, 3, 'Rejected topic.', 'rejected', 5),
    ('topic-merge', 3, 1, 'Deleted.', 'open', 6);
  insert into proposals (kind, highlight_id, reason, state, created_at) values
    ('highlight-lost', 1, 'plain-check', 'open', 7);
  delete from proposals where id = 6;
`;

const insertGap = (topic: number | null, extra = "", values = "") =>
  `insert into proposals (kind, topic_id${extra}, reason, state, created_at) values ('overview-gap', ${String(topic)}${values}, 'plain-check', 'open', 1)`;

describe("the overview-gap migration on a database made by the release before it", () => {
  let release: OlderRelease;
  let instance: Instance;

  const sqlite = () => release.sqlite();

  const snapshot = (): string => {
    const database = sqlite();

    const found = JSON.stringify([
      database.prepare("select * from proposals order by id").all(),
      database.prepare("select name, seq from sqlite_sequence order by name").all(),
      database.prepare("select name from d1_migrations order by name").all(),
    ]);

    database.close();

    return found;
  };

  before(async () => {
    release = await startOlderRelease(OVERVIEW_MIGRATION, SEED);
    ({ instance } = release);
  });

  after(() => release.close());

  it("keeps every row in every state with its columns and id, and gives topic_id the value null", () => {
    const database = sqlite();

    assert.equal(
      JSON.stringify(
        database
          .prepare(
            "select id, kind, state, from_tag_id as ft, into_tag_id as it, from_topic_id as fo, into_topic_id as io, highlight_id as h, topic_id as t, reason, cursor, moved, unit_revision as u from proposals order by id",
          )
          .all(),
      ),
      JSON.stringify(
        [
          [1, "tag-merge", "open", 1, 2, null, null, null, null, "Open.", null, null, null],
          [2, "tag-merge", "accepting", 2, 3, null, null, null, null, "Accepting.", 40, 12, 3],
          [3, "tag-merge", "declined", 3, 1, null, null, null, null, null, null, null, null],
          [4, "topic-merge", "open", null, null, 1, 2, null, null, "Open topic.", null, null, null],
          [
            5,
            "topic-merge",
            "rejected",
            null,
            null,
            2,
            3,
            null,
            null,
            "Rejected topic.",
            null,
            null,
            null,
          ],
          [
            7,
            "highlight-lost",
            "open",
            null,
            null,
            null,
            null,
            1,
            null,
            "plain-check",
            null,
            null,
            null,
          ],
        ].map(([id, kind, state, ft, intoTag, fo, io, h, t, reason, cursor, moved, u]) => ({
          id,
          kind,
          state,
          ft,
          it: intoTag,
          fo,
          io,
          h,
          t,
          reason,
          cursor,
          moved,
          u,
        })),
      ),
    );
    database.close();
  });

  it("gives the next row an id above the old high-water mark, and lists it beside the earlier kinds", async () => {
    const database = sqlite();

    const [inserted] = database.prepare(`${insertGap(1)} returning id`).all();

    assert.equal(inserted?.["id"], 8);
    database.close();

    const page = await readPage(instance);

    assert.deepEqual(
      page.proposals.map(({ id, kind }) => [id, kind]),
      [
        [8, "overview-gap"],
        [7, "highlight-lost"],
        [4, "topic-merge"],
        [2, "tag-merge"],
        [1, "tag-merge"],
      ],
    );
    assert.deepEqual(
      gapsOf(page).map(({ topic }) => [topic.name, topic.uncovered, topic.items]),
      [["X", 1, 1]],
    );
  });

  it("refuses a row without a Topic, with another subject, or twice for one Topic", () => {
    const database = sqlite();

    assert.throws(() => {
      database.exec(insertGap(null));
    }, /proposals_subject/u);
    assert.throws(() => {
      database.exec(insertGap(2, ", from_topic_id", ", 1"));
    }, /proposals_subject/u);
    assert.throws(() => {
      database.exec(insertGap(2, ", highlight_id", ", 1"));
    }, /proposals_subject/u);
    assert.throws(() => {
      database.exec(insertGap(2, ", from_tag_id", ", 1"));
    }, /proposals_subject/u);
    assert.throws(() => {
      database.exec(insertGap(1));
    }, /UNIQUE constraint failed: proposals.topic_id/u);
    assert.doesNotThrow(() => {
      database.exec(insertGap(2));
    });
    database.close();
  });

  it("refuses a row of an earlier kind that names a Topic in topic_id, and an unknown kind", () => {
    const database = sqlite();

    const refused = [
      "insert into proposals (kind, from_tag_id, into_tag_id, topic_id, reason, state, created_at) values ('tag-merge', 1, 3, 3, 'r', 'open', 1)",
      "insert into proposals (kind, from_topic_id, into_topic_id, topic_id, reason, state, created_at) values ('topic-merge', 1, 3, 3, 'r', 'open', 1)",
      "insert into proposals (kind, highlight_id, topic_id, reason, state, created_at) values ('highlight-lost', 1, 3, 'r', 'open', 1)",
      "update proposals set topic_id = 3 where id = 1",
      "update proposals set topic_id = 3 where id = 7",
      "update proposals set topic_id = null where kind = 'overview-gap'",
    ];

    for (const statement of refused) {
      assert.throws(
        () => {
          database.exec(statement);
        },
        /proposals_subject/u,
        statement,
      );
    }

    assert.throws(() => {
      database.exec(
        "insert into proposals (kind, topic_id, reason, state, created_at) values ('unknown', 3, 'r', 'open', 1)",
      );
    }, /proposals_values/u);
    assert.throws(() => {
      database.exec("update proposals set kind = 'unknown' where topic_id = 1");
    }, /proposals_values/u);
    database.close();
  });

  it("updates a row to every state and removes it with its Topic", () => {
    const database = sqlite();

    for (const state of ["accepting", "rejected", "declined", "open"]) {
      assert.doesNotThrow(() => {
        database.exec(`update proposals set state = '${state}' where topic_id = 1`);
      });
    }

    database.exec("update items set topic_id = 3 where topic_id = 1");
    database.exec("delete from topics where id = 1 and not exists (select 1 from pins)");

    assert.equal(
      database.prepare("select count(*) as n from proposals where topic_id = 1").get()?.["n"],
      0,
    );
    database.close();
  });

  it("starts again on the migrated file and changes no row, sequence or migration record", () => {
    const earlier = snapshot();

    release.startAgain();

    assert.equal(snapshot(), earlier);
    assert.match(earlier, new RegExp(OVERVIEW_MIGRATION, "u"));
  });
});
