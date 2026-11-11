import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { migrateData } from "../src/core/data-steps.ts";
import { openDatabase } from "../src/targets/node/database.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

describe("the tag-keys step keeps the owner's decisions when two spellings of a Tag become one", () => {
  let folder = "";
  let database: ReturnType<typeof openDatabase>;
  let sqlite: DatabaseSync;

  const proposals = (): string =>
    JSON.stringify(
      sqlite
        .prepare(
          "select id, from_tag_id as a, into_tag_id as b, state, reason from proposals order by id",
        )
        .all(),
    );

  before(async () => {
    folder = await mkdtemp(join(tmpdir(), "threadsift-proposals-merge-"));
    const file = join(folder, "threadsift.db");
    database = openDatabase(file, MIGRATIONS);
    sqlite = new DatabaseSync(file);
    sqlite.exec("PRAGMA foreign_keys = ON");

    sqlite.exec(`
      insert into tags (id, key, name) values
        (1, 'stored-a', 'Machine Learning'), (2, 'stored-b', 'machine learning'),
        (3, 'ml', 'ml'), (4, 'four', 'four'), (5, 'five', 'five'), (6, 'six', 'six'), (7, 'seven', 'seven'), (8, 'eight', 'eight');
      insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values
        ('tag-merge', 2, 3, 'Short form.', 'rejected', 1),
        ('tag-merge', 1, 2, 'Same name.', 'open', 1),
        ('tag-merge', 1, 4, 'Open on the survivor.', 'open', 1),
        ('tag-merge', 4, 2, 'Rejected on the loser.', 'rejected', 1),
        ('tag-merge', 1, 5, 'Rejected on the survivor.', 'rejected', 1),
        ('tag-merge', 2, 5, 'Open on the loser.', 'open', 1),
        ('tag-merge', 2, 6, 'Open on the loser, the smaller id.', 'open', 1),
        ('tag-merge', 1, 6, 'Open on the survivor.', 'open', 1),
        ('tag-merge', 1, 7, 'Accepting on the survivor.', 'accepting', 1),
        ('tag-merge', 7, 2, 'Declined on the loser.', 'declined', 1),
        ('tag-merge', 1, 8, 'Open on the survivor, the smaller id.', 'open', 1),
        ('tag-merge', 2, 8, 'Open on the loser, the larger id.', 'open', 1);
    `);

    await migrateData(database.db);
  });

  after(async () => {
    sqlite.close();
    database.close();
    await rm(folder, { recursive: true });
  });

  it("leaves one Tag under the recomputed key", () => {
    assert.equal(
      JSON.stringify(sqlite.prepare("select id, name from tags where id in (1, 2)").all()),
      '[{"id":1,"name":"Machine Learning"}]',
    );
  });

  it("repoints a rejected row, drops the pair of one Tag with itself, and keeps the stronger row of two that reach one pair, the smaller id when they are as strong", () => {
    assert.equal(
      proposals(),
      JSON.stringify([
        { id: 1, a: 1, b: 3, state: "rejected", reason: "Short form." },
        { id: 4, a: 4, b: 1, state: "rejected", reason: "Rejected on the loser." },
        { id: 5, a: 1, b: 5, state: "rejected", reason: "Rejected on the survivor." },
        { id: 7, a: 1, b: 6, state: "open", reason: "Open on the loser, the smaller id." },
        { id: 9, a: 1, b: 7, state: "accepting", reason: "Accepting on the survivor." },
        { id: 11, a: 1, b: 8, state: "open", reason: "Open on the survivor, the smaller id." },
      ]),
    );
  });
});
