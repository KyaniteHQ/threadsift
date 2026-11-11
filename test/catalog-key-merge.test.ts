import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { migrateData } from "../src/core/data-steps.ts";
import { openDatabase } from "../src/targets/node/database.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const LOSER_ENTRIES = 501;

const Count = z.object({ n: z.number() });

describe("the topic-keys step merges two Topics with entries, a page and a lease each whose stored keys differ and whose recomputed keys are equal", () => {
  let folder = "";
  let database: ReturnType<typeof openDatabase>;
  let sqlite: DatabaseSync;

  const rows = (query: string): string => JSON.stringify(sqlite.prepare(query).all());

  const count = (query: string): number => Count.parse(sqlite.prepare(query).get()).n;

  before(async () => {
    folder = await mkdtemp(join(tmpdir(), "threadsift-merge-"));
    const file = join(folder, "threadsift.db");
    database = openDatabase(file, MIGRATIONS);
    sqlite = new DatabaseSync(file);
    sqlite.exec("PRAGMA foreign_keys = ON");

    sqlite.exec(`
      insert into topics (id, key, name) values (1, 'stored-a', 'Istanbul'), (2, 'stored-b', 'ISTANBUL');
      insert into items (id, source, kind, normalized_url, original_url, saved_at, topic_id)
        values (1, 'other', 'link', 'https://example.com/a', 'https://example.com/a', 1, 1),
               (2, 'other', 'link', 'https://example.com/b', 'https://example.com/b', 2, 2);
      insert into topic_pages (topic_id, overview, revision, built_from, updated_at)
        values (1, 'Survivor page', 1, '[]', 1), (2, 'Loser page', 1, '[]', 1);
      insert into topic_leases (topic_id, holder, expires_at, generation)
        values (1, 'holder-a', 0, 1), (2, 'holder-b', 0, 1);
      insert into log_entries (at, action, topic, topic_id) values (1, 'topic', 'Istanbul', 1);
      with recursive n(i) as (select 1 union all select i + 1 from n where i < ${String(LOSER_ENTRIES)})
        insert into log_entries (at, action, topic, topic_id) select i, 'overview', 'ISTANBUL', 2 from n;
    `);

    await migrateData(database.db);
  });

  after(async () => {
    sqlite.close();
    database.close();
    await rm(folder, { recursive: true });
  });

  it("leaves one Topic under the recomputed key and moves the loser's Item to it", () => {
    assert.equal(
      rows("select id, key, name from topics"),
      '[{"id":1,"key":"istanbul","name":"Istanbul"}]',
    );
    assert.equal(count("select count(*) as n from items where topic_id = 1"), 2);
  });

  it("moves every entry of the loser, past one unit of 500, to the survivor", () => {
    assert.equal(
      count("select count(*) as n from log_entries where topic_id = 1"),
      LOSER_ENTRIES + 1,
    );
    assert.equal(count("select count(*) as n from log_entries"), LOSER_ENTRIES + 1);
  });

  it("removes the loser's page and lease with it and keeps the survivor's", () => {
    assert.equal(rows("select topic_id from topic_pages"), '[{"topic_id":1}]');
    assert.equal(rows("select topic_id from topic_leases"), '[{"topic_id":1}]');
  });
});
