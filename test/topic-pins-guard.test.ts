import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { guardHolds } from "../src/core/guards.ts";
import { pinnedDigest } from "../src/core/pins.ts";
import { openDatabase } from "../src/targets/node/database.ts";
import { Instance } from "./instance.ts";
import { script } from "./pin-fixtures.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const topicPin = (id: number, into: number) =>
  `insert into pins (id, kind, from_key, from_name, into_topic_id, created_at) values (${String(id)}, 'topic-merge', 'ml', 'ML', ${String(into)}, 1);`;

describe("the Pin guard refuses a batch whose Topic and Tag resolutions went stale", () => {
  let instance: Instance;
  let database: ReturnType<typeof openDatabase>;

  const sqlite = (statement: string) => {
    script(instance, statement);
  };

  const digest = { tags: ["ai"], topic: "ML" } as const;

  before(async () => {
    instance = await Instance.start();
    script(
      instance,
      `insert into topics (id, key, name) values (1, 'machine learning', 'Machine Learning'), (2, 'deep learning', 'Deep Learning');
       insert into tags (id, key, name) values (1, 'artificial intelligence', 'AI');`,
    );
    database = openDatabase(instance.databaseFile, MIGRATIONS);
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  it("holds while the Pins it read are unchanged, with and without a Pin", async () => {
    const without = await pinnedDigest(database.db, digest);

    assert.equal(await guardHolds(database.db, without.current), true);

    sqlite(topicPin(1, 1));

    const withPin = await pinnedDigest(database.db, digest);

    assert.equal(withPin.topic, "Machine Learning");
    assert.equal(withPin.renamed, true);
    assert.equal(await guardHolds(database.db, withPin.current), true);
  });

  it("fails when a Pin appeared after the read", async () => {
    sqlite("delete from pins");

    const read = await pinnedDigest(database.db, digest);

    sqlite(topicPin(2, 1));

    assert.equal(await guardHolds(database.db, read.current), false);
  });

  it("fails when the Pin it read was repointed or removed after the read", async () => {
    const read = await pinnedDigest(database.db, digest);

    sqlite("update pins set into_topic_id = 2 where id = 2");

    assert.equal(await guardHolds(database.db, read.current), false);

    const repointed = await pinnedDigest(database.db, digest);

    sqlite("delete from pins");

    assert.equal(await guardHolds(database.db, repointed.current), false);
  });

  it("does not take a Tag Pin for the Topic Pin of the same key", async () => {
    sqlite(
      "insert into pins (id, kind, from_key, from_name, into_tag_id, created_at) values (10, 'tag-merge', 'ml', 'ML', 1, 1);",
    );

    const read = await pinnedDigest(database.db, digest);

    assert.equal(read.topic, "ML");
    assert.equal(await guardHolds(database.db, read.current), true);

    sqlite(topicPin(11, 1));

    assert.equal(await guardHolds(database.db, read.current), false);
  });
});
