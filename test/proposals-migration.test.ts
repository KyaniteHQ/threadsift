import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import { openDatabase } from "../src/targets/node/database.ts";
import { Instance } from "./instance.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const REBUILD = "0041_topic-merge-proposals.sql";

const BUSY_TIMEOUT_MS = 5000;

function stateOf(file: string): string {
  const database = new DatabaseSync(file, { timeout: BUSY_TIMEOUT_MS });

  const found = JSON.stringify([
    database.prepare("select * from proposals order by id").all(),
    database.prepare("select name, seq from sqlite_sequence order by name").all(),
    database.prepare("select name from d1_migrations order by name").all(),
  ]);

  database.close();

  return found;
}

describe("the proposals and Pins rebuilds keep every row and never reuse an id", () => {
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

    made.exec(`
      insert into tags (id, key, name) values (1, 'a', 'A'), (2, 'b', 'B'), (3, 'c', 'C'), (4, 'd', 'D'), (5, 'e', 'E'), (6, 'f', 'F');
      insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at, cursor, moved, unit_revision) values
        ('tag-merge', 1, 2, 'Open.', 'open', 1, null, null, null),
        ('tag-merge', 2, 3, 'Accepting.', 'accepting', 2, 40, 12, 3),
        ('tag-merge', 3, 4, null, 'declined', 3, null, null, null),
        ('tag-merge', 4, 5, 'Rejected.', 'rejected', 4, null, null, null),
        ('tag-merge', 5, 6, 'Deleted.', 'open', 5, null, null, null);
      delete from proposals where id = 5;
      insert into pins (kind, from_key, from_name, into_tag_id, created_at) values
        ('tag-merge', 'old a', 'Old A', 2, 1), ('tag-merge', 'old b', 'Old B', 3, 2), ('tag-merge', 'old c', 'Old C', 4, 3);
      delete from pins where id = 3;
    `);
    made.close();
  };

  before(async () => {
    older = await mkdtemp(join(tmpdir(), "threadsift-proposals-migration-"));

    await Promise.all(
      (await readdir(MIGRATIONS))
        .filter((name) => name.endsWith(".sql") && name < REBUILD)
        .map((name) => cp(join(MIGRATIONS, name), join(older, name))),
    );

    instance = await Instance.start({ prepare: seedOlder });
    await instance.setUp();
  });

  after(async () => {
    await instance.close();
    await rm(older, { recursive: true });
  });

  it("keeps the rows and their columns", () => {
    const database = sqlite();

    assert.equal(
      JSON.stringify(
        database
          .prepare(
            "select id, kind, from_tag_id, into_tag_id, from_topic_id, into_topic_id, reason, state, created_at, cursor, moved, unit_revision from proposals order by id",
          )
          .all(),
      ),
      JSON.stringify(
        [
          [1, 1, 2, "Open.", "open", 1, null, null, null],
          [2, 2, 3, "Accepting.", "accepting", 2, 40, 12, 3],
          [3, 3, 4, null, "declined", 3, null, null, null],
          [4, 4, 5, "Rejected.", "rejected", 4, null, null, null],
        ].map(([id, from, into, reason, state, at, cursor, moved, revision]) => ({
          id,
          kind: "tag-merge",
          from_tag_id: from,
          into_tag_id: into,
          from_topic_id: null,
          into_topic_id: null,
          reason,
          state,
          created_at: at,
          cursor,
          moved,
          unit_revision: revision,
        })),
      ),
    );
    database.close();
  });

  it("lists the migrated open and accepting rows through the app, and rejects the open one", async () => {
    const page = await instance.read("GET", "/api/proposals", ProposalPageSchema);

    assert.deepEqual(
      page.proposals.map(({ id, kind, state, from, into, reason }) => ({
        id,
        kind,
        state,
        from: from.name,
        into: into.name,
        reason,
      })),
      [
        {
          id: 2,
          kind: "tag-merge",
          state: "accepting",
          from: "B",
          into: "C",
          reason: "Accepting.",
        },
        { id: 1, kind: "tag-merge", state: "open", from: "A", into: "B", reason: "Open." },
      ],
    );

    const rejected = await instance.send("POST", "/api/proposals/1/reject");

    assert.deepEqual(
      [rejected.status, rejected.body],
      [200, JSON.stringify({ state: "rejected" })],
    );
  });

  it("gives the next row an id above the old high-water mark, and leaves no placeholder row", () => {
    const database = sqlite();

    const [inserted] = database
      .prepare(
        "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values ('tag-merge', 1, 6, 'New.', 'open', 6) returning id",
      )
      .all();

    assert.equal(inserted?.["id"], 6);
    assert.equal(database.prepare("select count(*) as n from proposals").get()?.["n"], 5);
    database.close();
  });

  it("keeps the Tag Pins of the older file, gives the next Pin an id above the old high-water mark and leaves no placeholder row", () => {
    const database = sqlite();

    assert.equal(
      JSON.stringify(
        database
          .prepare("select id, kind, from_key, into_tag_id, into_topic_id from pins order by id")
          .all(),
      ),
      JSON.stringify([
        { id: 1, kind: "tag-merge", from_key: "old a", into_tag_id: 2, into_topic_id: null },
        { id: 2, kind: "tag-merge", from_key: "old b", into_tag_id: 3, into_topic_id: null },
      ]),
    );

    const [inserted] = database
      .prepare(
        "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values ('tag-merge', 'old d', 'Old D', 5, 4) returning id",
      )
      .all();

    assert.equal(inserted?.["id"], 4);
    assert.equal(database.prepare("select count(*) as n from pins").get()?.["n"], 3);
    database.close();
  });

  it("keeps one row for a pair of Tags or of Topics whichever way round, and removes a Topic row with its Topic", () => {
    const database = sqlite();

    database.exec("insert into topics (id, key, name) values (1, 'x', 'X'), (2, 'y', 'Y')");

    const tagRow = database.prepare(
      "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values ('tag-merge', ?, ?, 'r', 'open', 7)",
    );

    const topicRow = database.prepare(
      "insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) values ('topic-merge', ?, ?, 'r', 'open', 7)",
    );

    assert.throws(() => tagRow.run(6, 1), /proposals_pair/u);

    topicRow.run(1, 2);

    assert.throws(() => topicRow.run(2, 1), /proposals_topic_pair/u);
    assert.throws(() => topicRow.run(1, 1), /proposals_topic_distinct/u);

    database.exec("delete from topics");

    assert.equal(
      database.prepare("select count(*) as n from proposals where kind = 'topic-merge'").get()?.[
        "n"
      ],
      0,
    );
    database.close();
  });

  it("starts again on the migrated file and changes no row, no sequence and no migration record", () => {
    const earlier = stateOf(instance.databaseFile);

    openDatabase(instance.databaseFile, MIGRATIONS).close();

    assert.equal(stateOf(instance.databaseFile), earlier);
    assert.match(earlier, new RegExp(REBUILD, "u"));
  });
});
