import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { Instance } from "./instance.ts";

const BUSY_TIMEOUT_MS = 5000;

const PAIR_COLUMNS = "from_item_id, into_item_id, from_digest, into_digest";

describe("the subject triggers of an items-disagree proposal and of the kinds that came before it", () => {
  let instance: Instance;
  let database: DatabaseSync;
  let first = 0;
  let second = 0;

  const insertDisagreement = (columns: string, ...values: readonly (number | null)[]): void => {
    database
      .prepare(
        `insert into proposals (kind, ${columns}, reason, state, created_at) values ('items-disagree', ${values.map(() => "?").join(", ")}, 'a reason', 'open', 0)`,
      )
      .run(...values);
  };

  before(async () => {
    instance = await Instance.start();
    database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });
    database.exec("PRAGMA foreign_keys = ON");

    const inserted = database
      .prepare(
        `insert into items (source, kind, normalized_url, original_url, saved_at) values ('article', 'article', 'a', 'a', 0), ('article', 'article', 'b', 'b', 0) returning id`,
      )
      .all();

    first = Number(inserted[0]?.["id"]);
    second = Number(inserted[1]?.["id"]);
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  it("refuses a row with one Item id, with equal ids, without a digest token and with another subject column", () => {
    assert.throws(() => {
      insertDisagreement("from_item_id, from_digest, into_digest", first, 1, 2);
    }, /proposals_subject/u);
    assert.throws(() => {
      insertDisagreement(PAIR_COLUMNS, first, first, 1, 2);
    }, /proposals_subject/u);
    assert.throws(() => {
      insertDisagreement("from_item_id, into_item_id", first, second);
    }, /proposals_subject/u);

    database.exec("insert into tags (id, key, name) values (1, 'tag', 'Tag')");

    assert.throws(() => {
      insertDisagreement(`${PAIR_COLUMNS}, from_tag_id`, first, second, 1, 2, 1);
    }, /proposals_subject/u);
  });

  it("refuses the four columns on every kind that came before it, on insert and on update", () => {
    database.exec(`
      insert into topics (id, key, name) values (1, 'topic', 'Topic'), (2, 'other', 'Other');
      insert into tags (id, key, name) values (11, 'first', 'First'), (12, 'second', 'Second');
      insert into highlights (id, item_id, exact, prefix, suffix, hint, projection, created_at, status, start)
        values (1, ${String(first)}, 'one', '', '', 0, 1, 1, 'gone', null);
    `);

    const subjects = [
      ["tag-merge", "from_tag_id, into_tag_id", "11, 12"],
      ["topic-merge", "from_topic_id, into_topic_id", "1, 2"],
      ["highlight-lost", "highlight_id", "1"],
      ["overview-gap", "topic_id", "1"],
    ] as const;

    const accepted = (kind: string, columns: string, values: string): void => {
      database.exec(
        `insert into proposals (kind, ${columns}, reason, state, created_at) values ('${kind}', ${values}, 'a reason', 'open', 0)`,
      );
    };

    const refusedInsert = (kind: string, columns: string, values: string, column: string): void => {
      assert.throws(
        () => {
          database
            .prepare(
              `insert into proposals (kind, ${columns}, ${column}, reason, state, created_at) values (?, ${values}, ?, 'a reason', 'open', 0)`,
            )
            .run(kind, first);
        },
        /proposals_subject/u,
        `${kind} insert with ${column}`,
      );
    };

    const refusedUpdate = (kind: string, column: string): void => {
      assert.throws(
        () => {
          database.prepare(`update proposals set ${column} = ? where kind = ?`).run(first, kind);
        },
        /proposals_subject/u,
        `${kind} update of ${column}`,
      );
    };

    for (const [kind, columns, values] of subjects) {
      assert.doesNotThrow(() => {
        accepted(kind, columns, values);
      });

      for (const column of PAIR_COLUMNS.split(", ")) {
        refusedInsert(kind, columns, values, column);
        refusedUpdate(kind, column);
      }
    }
  });

  it("keeps one row for a pair whichever way round it is stored, and cascades from either Item", () => {
    insertDisagreement(PAIR_COLUMNS, first, second, 1, 2);

    assert.throws(() => {
      insertDisagreement(PAIR_COLUMNS, second, first, 2, 1);
    }, /UNIQUE constraint failed/u);
    assert.throws(() => {
      database
        .prepare("update proposals set into_item_id = from_item_id where kind = 'items-disagree'")
        .run();
    }, /proposals_subject/u);

    database.prepare("delete from items where id = ?").run(second);

    assert.equal(
      database.prepare("select count(*) as n from proposals where kind = 'items-disagree'").get()?.[
        "n"
      ],
      0,
    );
  });
});
