import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { migrateData } from "../src/core/data-steps.ts";
import { openDatabase } from "../src/targets/node/database.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

describe("a topic-keys merge leaves overview-gap rows alone", () => {
  let folder = "";
  let database: ReturnType<typeof openDatabase>;
  let sqlite: DatabaseSync;

  before(async () => {
    folder = await mkdtemp(join(tmpdir(), "threadsift-overview-gap-keys-"));

    const file = join(folder, "threadsift.db");

    database = openDatabase(file, MIGRATIONS);
    sqlite = new DatabaseSync(file);
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec(`
      insert into topics (id, key, name) values
        (1, 'stored-a', 'Machine Learning'), (2, 'stored-b', 'machine learning'), (3, 'other', 'other');
      insert into proposals (kind, topic_id, reason, state, created_at) values
        ('overview-gap', 1, 'plain-check', 'open', 1),
        ('overview-gap', 2, 'plain-check', 'open', 2),
        ('overview-gap', 3, 'plain-check', 'rejected', 3);
    `);

    await migrateData(database.db);
  });

  after(async () => {
    sqlite.close();
    database.close();
    await rm(folder, { recursive: true });
  });

  it("deletes the row of the deleted Topic by cascade and keeps the survivor's row and the others as they were, with no repoint", () => {
    assert.equal(
      JSON.stringify(sqlite.prepare("select id, topic_id, state from proposals order by id").all()),
      JSON.stringify([
        { id: 1, topic_id: 1, state: "open" },
        { id: 3, topic_id: 3, state: "rejected" },
      ]),
    );
  });
});
