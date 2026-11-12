import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { openDatabase } from "../src/targets/node/database.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const REBUILD = "0041_topic-merge-proposals.sql";

describe("the proposals rebuild keeps every row and never reuses an id", () => {
  let folder = "";
  let file = "";

  const sqlite = (): DatabaseSync => {
    const database = new DatabaseSync(file);
    database.exec("PRAGMA foreign_keys = ON");

    return database;
  };

  before(async () => {
    folder = await mkdtemp(join(tmpdir(), "threadsift-proposals-migration-"));
    file = join(folder, "threadsift.db");

    const older = join(folder, "older");
    await mkdir(older);

    await Promise.all(
      (await readdir(MIGRATIONS))
        .filter((name) => name.endsWith(".sql") && name < REBUILD)
        .map((name) => cp(join(MIGRATIONS, name), join(older, name))),
    );

    openDatabase(file, older).close();

    const made = sqlite();

    made.exec(`
      insert into tags (id, key, name) values (1, 'a', 'A'), (2, 'b', 'B'), (3, 'c', 'C'), (4, 'd', 'D'), (5, 'e', 'E'), (6, 'f', 'F');
      insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at, cursor, moved, unit_revision) values
        ('tag-merge', 1, 2, 'Open.', 'open', 1, null, null, null),
        ('tag-merge', 2, 3, 'Accepting.', 'accepting', 2, 40, 12, 3),
        ('tag-merge', 3, 4, null, 'declined', 3, null, null, null),
        ('tag-merge', 4, 5, 'Rejected.', 'rejected', 4, null, null, null),
        ('tag-merge', 5, 6, 'Deleted.', 'open', 5, null, null, null);
      delete from proposals where id = 5;
    `);
    made.close();

    openDatabase(file, MIGRATIONS).close();
  });

  after(() => rm(folder, { recursive: true }));

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

  it("starts again on the migrated file without applying anything", () => {
    openDatabase(file, MIGRATIONS).close();

    const database = sqlite();

    assert.equal(
      database.prepare("select count(*) as n from d1_migrations where name = ?").get(REBUILD)?.[
        "n"
      ],
      1,
    );
    database.close();
  });
});
