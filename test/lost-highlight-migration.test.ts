import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { openDatabase } from "../src/targets/node/database.ts";
import { Instance } from "./instance.ts";
import { mergesOf, readPage } from "./lost-highlight-fixtures.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const LOST_MIGRATION = "0044_lost-highlight-proposals.sql";

const BUSY_TIMEOUT_MS = 5000;

const SEED = `
  insert into items (id, source, kind, normalized_url, original_url, saved_at) values (1, 'article', 'article', 'u1', 'u1', 1);
  insert into highlights (id, item_id, exact, prefix, suffix, hint, projection, created_at, status, start) values
    (1, 1, 'one', '', '', 0, 1, 1, 'gone', null),
    (2, 1, 'two', '', '', 0, 1, 2, 'ambiguous', null),
    (3, 1, 'three', '', '', 0, 1, 3, 'gone', null);
  insert into tags (id, key, name) values (1, 'a', 'A'), (2, 'b', 'B'), (3, 'c', 'C'), (4, 'd', 'D');
  insert into topics (id, key, name) values (1, 'x', 'X'), (2, 'y', 'Y'), (3, 'z', 'Z');
  insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at, cursor, moved, unit_revision) values
    ('tag-merge', 1, 2, 'Open.', 'open', 1, null, null, null),
    ('tag-merge', 2, 3, 'Accepting.', 'accepting', 2, 40, 12, 3),
    ('tag-merge', 3, 4, null, 'declined', 3, null, null, null),
    ('tag-merge', 4, 1, 'Rejected.', 'rejected', 4, null, null, null);
  insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) values
    ('topic-merge', 1, 2, 'Open topic.', 'open', 5),
    ('topic-merge', 2, 3, 'Rejected topic.', 'rejected', 6),
    ('topic-merge', 3, 1, 'Deleted.', 'open', 7);
  delete from proposals where id = 7;
`;

const insertLost = (highlight: number | null, extra = "", values = "") =>
  `insert into proposals (kind, highlight_id${extra}, reason, state, created_at) values ('highlight-lost', ${String(highlight)}${values}, 'plain-check', 'open', 1)`;

describe("the lost-Highlight migration on a database made by the release before it", () => {
  let older = "";
  let instance: Instance;

  const sqlite = (): DatabaseSync => {
    const database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });
    database.exec("PRAGMA foreign_keys = ON");

    return database;
  };

  const seedOlder = (file: string): void => {
    openDatabase(file, older).close();

    const made = new DatabaseSync(file);

    made.exec(SEED);
    made.close();
  };

  before(async () => {
    older = await mkdtemp(join(tmpdir(), "threadsift-lost-highlight-migration-"));

    await Promise.all(
      (await readdir(MIGRATIONS))
        .filter((name) => name.endsWith(".sql") && name < LOST_MIGRATION)
        .map((name) => cp(join(MIGRATIONS, name), join(older, name))),
    );

    instance = await Instance.start({ prepare: seedOlder });
    await instance.setUp();
  });

  after(async () => {
    await instance.close();
    await rm(older, { recursive: true });
  });

  it("keeps every row in every state, with the same columns and ids", () => {
    const database = sqlite();

    assert.equal(
      JSON.stringify(
        database
          .prepare(
            "select id, kind, state, from_tag_id, into_tag_id, from_topic_id, into_topic_id, reason, cursor, moved, unit_revision, highlight_id from proposals order by id",
          )
          .all(),
      ),
      JSON.stringify(
        [
          [1, "tag-merge", "open", 1, 2, null, null, "Open.", null, null, null],
          [2, "tag-merge", "accepting", 2, 3, null, null, "Accepting.", 40, 12, 3],
          [3, "tag-merge", "declined", 3, 4, null, null, null, null, null, null],
          [4, "tag-merge", "rejected", 4, 1, null, null, "Rejected.", null, null, null],
          [5, "topic-merge", "open", null, null, 1, 2, "Open topic.", null, null, null],
          [6, "topic-merge", "rejected", null, null, 2, 3, "Rejected topic.", null, null, null],
        ].map(
          ([
            id,
            kind,
            state,
            fromTag,
            intoTag,
            fromTopic,
            intoTopic,
            reason,
            cursor,
            moved,
            revision,
          ]) => ({
            id,
            kind,
            state,
            from_tag_id: fromTag,
            into_tag_id: intoTag,
            from_topic_id: fromTopic,
            into_topic_id: intoTopic,
            reason,
            cursor,
            moved,
            unit_revision: revision,
            highlight_id: null,
          }),
        ),
      ),
    );
    database.close();
  });

  it("gives the next row an id above the old high-water mark", () => {
    const database = sqlite();

    const [inserted] = database.prepare(`${insertLost(1)} returning id`).all();

    assert.equal(inserted?.["id"], 8);
    database.close();
  });

  it("lists the Tag and Topic rows still open, and the lost row beside them", async () => {
    const page = await readPage(instance);

    assert.deepEqual(
      page.proposals.map(({ id, kind }) => [id, kind]),
      [
        [8, "highlight-lost"],
        [5, "topic-merge"],
        [2, "tag-merge"],
        [1, "tag-merge"],
      ],
    );
    assert.equal(mergesOf(page).length, 3);
  });

  it("refuses a lost row without a Highlight, with another subject, or twice for one Highlight", () => {
    const database = sqlite();

    assert.throws(() => {
      database.exec(insertLost(null));
    }, /proposals_subject/u);
    assert.throws(() => {
      database.exec(insertLost(2, ", from_tag_id", ", 1"));
    }, /proposals_subject/u);
    assert.throws(() => {
      database.exec(insertLost(2, ", into_topic_id", ", 1"));
    }, /proposals_subject/u);
    assert.throws(() => {
      database.exec(insertLost(1));
    }, /UNIQUE constraint failed: proposals.highlight_id/u);
    assert.doesNotThrow(() => {
      database.exec(insertLost(2));
    });
    database.close();
  });

  it("refuses a Tag or Topic row that names a Highlight, and an unknown kind", () => {
    const database = sqlite();

    assert.throws(() => {
      database.exec(
        "insert into proposals (kind, from_tag_id, into_tag_id, highlight_id, reason, state, created_at) values ('tag-merge', 1, 3, 3, 'r', 'open', 1)",
      );
    }, /proposals_subject/u);
    assert.throws(() => {
      database.exec(
        "insert into proposals (kind, from_topic_id, into_topic_id, highlight_id, reason, state, created_at) values ('topic-merge', 1, 3, 3, 'r', 'open', 1)",
      );
    }, /proposals_subject/u);
    assert.throws(() => {
      database.exec("update proposals set highlight_id = 3 where id = 1");
    }, /proposals_subject/u);
    assert.throws(() => {
      database.exec(
        "insert into proposals (kind, highlight_id, reason, state, created_at) values ('unknown', 3, 'r', 'open', 1)",
      );
    }, /proposals_values/u);
    assert.throws(() => {
      database.exec("update proposals set kind = 'unknown' where highlight_id = 1");
    }, /proposals_values/u);
    database.close();
  });

  it("updates a lost row to every state, and removes it with its Highlight", () => {
    const database = sqlite();

    for (const state of ["accepting", "rejected", "declined", "open"]) {
      assert.doesNotThrow(() => {
        database.exec(`update proposals set state = '${state}' where highlight_id = 1`);
      });
    }

    database.exec("delete from highlights where id = 1");

    assert.equal(
      database.prepare("select count(*) as n from proposals where highlight_id = 1").get()?.["n"],
      0,
    );
    assert.equal(
      database.prepare("select count(*) as n from proposals where highlight_id is null").get()?.[
        "n"
      ],
      6,
    );
    database.close();
  });

  it("starts again on the migrated file and changes no row, sequence or migration record", () => {
    const state = (): string => {
      const database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });

      const found = JSON.stringify([
        database.prepare("select * from proposals order by id").all(),
        database.prepare("select name, seq from sqlite_sequence order by name").all(),
        database.prepare("select name from d1_migrations order by name").all(),
      ]);

      database.close();

      return found;
    };

    const earlier = state();

    openDatabase(instance.databaseFile, MIGRATIONS).close();

    assert.equal(state(), earlier);
    assert.match(earlier, new RegExp(LOST_MIGRATION, "u"));
  });
});
