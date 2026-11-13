import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { openDatabase } from "../src/targets/node/database.ts";
import { Instance } from "./instance.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const PIN_MIGRATION = "0047_disagreement-pins.sql";

const BUSY_TIMEOUT_MS = 5000;

const SEED = `
  insert into tags (id, key, name) values (1, 'a', 'A'), (2, 'b', 'B'), (3, 'c', 'C');
  insert into topics (id, key, name) values (1, 'x', 'X'), (2, 'y', 'Y');
  insert into items (id, source, kind, normalized_url, original_url, saved_at, topic_id) values
    (1, 'article', 'article', 'u1', 'u1', 1, 1), (2, 'article', 'article', 'u2', 'u2', 2, 1);
  insert into pins (id, kind, from_key, from_name, into_tag_id, into_topic_id, created_at) values
    (1, 'tag-merge', 'old-tag', 'old-tag', 1, null, 1),
    (2, 'topic-merge', 'old-topic', 'old-topic', null, 2, 2),
    (3, 'tag-merge', 'deleted', 'deleted', 3, null, 3);
  delete from pins where id = 3;
`;

describe("the Pin migration on a database made by the release before it", () => {
  let older = "";
  let instance: Instance;

  const sqlite = (): DatabaseSync => {
    const database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });

    database.exec("PRAGMA foreign_keys = ON");

    return database;
  };

  before(async () => {
    older = await mkdtemp(join(tmpdir(), "threadsift-pin-migration-"));

    await Promise.all(
      (await readdir(MIGRATIONS))
        .filter((name) => name.endsWith(".sql") && name < PIN_MIGRATION)
        .map((name) => cp(join(MIGRATIONS, name), join(older, name))),
    );

    instance = await Instance.start({
      prepare: (file) => {
        openDatabase(file, older).close();

        const made = new DatabaseSync(file);

        made.exec(SEED);
        made.close();
      },
    });
    await instance.setUp();
  });

  after(async () => {
    await instance.close();
    await rm(older, { recursive: true });
  });

  it("keeps both Pins with their columns and ids, with the four new columns null, and creates an index on each Item column", () => {
    const database = sqlite();

    assert.deepEqual(
      database
        .prepare(
          "select id, kind, from_key as key, into_tag_id as tag, into_topic_id as topic, from_item_id as fi, into_item_id as ii, from_digest as fd, into_digest as id2 from pins order by id",
        )
        .all()
        .map((row) => Object.assign({}, row)),
      [
        { id: 1, kind: "tag-merge", key: "old-tag", tag: 1, topic: null },
        { id: 2, kind: "topic-merge", key: "old-topic", tag: null, topic: 2 },
      ].map((pin) => Object.assign(pin, { fi: null, ii: null, fd: null, id2: null })),
    );
    assert.deepEqual(
      database
        .prepare(
          "select name from pragma_index_list('pins') where name in ('pins_from_item', 'pins_into_item') order by name",
        )
        .all()
        .map((row) => row["name"]),
      ["pins_from_item", "pins_into_item"],
    );
    database.close();
  });

  it("gives the next Pin an id above the old high-water mark and accepts the third kind", () => {
    const database = sqlite();

    const [inserted] = database
      .prepare(
        "insert into pins (kind, from_key, from_name, from_item_id, into_item_id, from_digest, into_digest, created_at) values ('items-disagree', '1:2', 'Opposite.', 1, 2, 1, 2, 4) returning id",
      )
      .all();

    database.close();
    assert.equal(inserted?.["id"], 4);
  });

  it("removes a disagreement Pin with the Item on either side of it and leaves the other Pins", () => {
    const database = sqlite();

    database.exec(
      "insert into items (id, source, kind, normalized_url, original_url, saved_at, topic_id) values (3, 'article', 'article', 'u3', 'u3', 3, 1), (4, 'article', 'article', 'u4', 'u4', 4, 1)",
    );
    database.exec(
      "insert into pins (kind, from_key, from_name, from_item_id, into_item_id, from_digest, into_digest, created_at) values ('items-disagree', '3:4', 'Opposite.', 3, 4, 3, 4, 7)",
    );

    const disagreements = () =>
      database
        .prepare("select from_key as key from pins where kind = 'items-disagree' order by id")
        .all()
        .map((row) => row["key"]);

    assert.deepEqual(disagreements(), ["1:2", "3:4"]);
    database.exec("delete from items where id = 1");
    assert.deepEqual(disagreements(), ["3:4"]);
    database.exec("delete from items where id = 4");
    assert.deepEqual(disagreements(), []);
    assert.equal(database.prepare("select count(*) as n from pins").get()?.["n"], 2);
    database.close();
  });
});
