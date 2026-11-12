import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { openDatabase } from "../src/targets/node/database.ts";
import { Instance } from "./instance.ts";
import { readPage } from "./lost-highlight-fixtures.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const DISAGREEMENT_MIGRATION = "0046_disagreement-proposals.sql";

const BUSY_TIMEOUT_MS = 5000;

const SEED = `
  insert into topics (id, key, name) values (1, 'x', 'X'), (2, 'y', 'Y'), (3, 'z', 'Z');
  insert into items (id, source, kind, normalized_url, original_url, saved_at, topic_id) values
    (1, 'article', 'article', 'u1', 'u1', 1, 1), (2, 'article', 'article', 'u2', 'u2', 2, 1);
  insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id) values
    (1, 'digest', '{}', 0, 'caller', 1, 0, 'done', 1), (2, 'digest', '{}', 0, 'caller', 1, 0, 'done', 2);
  insert into digests (item_id, digest, title, topic, task_id, generation, created_at) values
    (1, '{"summary":"One."}', 'One', 'X', 1, 0, 1), (2, '{"summary":"Two."}', 'Two', 'Y', 2, 0, 1);
  insert into highlights (id, item_id, exact, prefix, suffix, hint, projection, created_at, status, start) values
    (1, 1, 'one', '', '', 0, 1, 1, 'gone', null);
  insert into tags (id, key, name) values (1, 'a', 'A'), (2, 'b', 'B'), (3, 'c', 'C');
  insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at, cursor, moved, unit_revision) values
    ('tag-merge', 1, 2, 'Open.', 'open', 1, null, null, null),
    ('tag-merge', 2, 3, 'Accepting.', 'accepting', 2, 40, 12, 3);
  insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) values
    ('topic-merge', 1, 2, 'Rejected.', 'rejected', 3), ('topic-merge', 2, 3, 'Deleted.', 'open', 4);
  insert into proposals (kind, highlight_id, reason, state, created_at) values ('highlight-lost', 1, 'plain-check', 'declined', 5);
  insert into proposals (kind, topic_id, reason, state, created_at) values ('overview-gap', 1, 'plain-check', 'open', 6);
  insert into proposals (kind, topic_id, reason, state, created_at) values ('overview-gap', 2, 'plain-check', 'open', 7);
  delete from proposals where id in (4, 7);
`;

describe("the disagreement migration on a database made by the release before it", () => {
  let older = "";
  let instance: Instance;

  const sqlite = (): DatabaseSync => {
    const database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });

    database.exec("PRAGMA foreign_keys = ON");

    return database;
  };

  before(async () => {
    older = await mkdtemp(join(tmpdir(), "threadsift-disagreement-migration-"));

    await Promise.all(
      (await readdir(MIGRATIONS))
        .filter((name) => name.endsWith(".sql") && name < DISAGREEMENT_MIGRATION)
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

  it("keeps every row in every state with its columns and id, and gives the four new columns the value null", () => {
    const database = sqlite();

    assert.deepEqual(
      database
        .prepare(
          "select id, kind, state, cursor, moved, unit_revision as revision, from_item_id as fi, into_item_id as ii, from_digest as fd, into_digest as id2 from proposals order by id",
        )
        .all()
        .map((row) => Object.assign({}, row)),
      [
        [1, "tag-merge", "open", null, null, null],
        [2, "tag-merge", "accepting", 40, 12, 3],
        [3, "topic-merge", "rejected", null, null, null],
        [5, "highlight-lost", "declined", null, null, null],
        [6, "overview-gap", "open", null, null, null],
      ].map(([id, kind, state, cursor, moved, revision]) => ({
        id,
        kind,
        state,
        cursor,
        moved,
        revision,
        fi: null,
        ii: null,
        fd: null,
        id2: null,
      })),
    );
    assert.equal(database.prepare("select count(*) as n from topic_checks").get()?.["n"], 0);
    database.close();
  });

  it("gives the next row an id above the deleted highest id and lists it beside the earlier kinds", async () => {
    const database = sqlite();

    const [inserted] = database
      .prepare(
        "insert into proposals (kind, from_item_id, into_item_id, from_digest, into_digest, reason, state, created_at) values ('items-disagree', 1, 2, 1, 2, 'Opposite.', 'open', 8) returning id",
      )
      .all();

    database.close();
    assert.equal(inserted?.["id"], 8);
    assert.equal((await readPage(instance)).proposals[0]?.id, 8);
  });

  it("accepts the new job kind and still refuses an unknown one", () => {
    const database = sqlite();

    assert.doesNotThrow(() => {
      database.exec(
        "insert into jobs (item_id, kind, state, attempts, next_attempt_at, address) values (1, 'disagreement_proposals', 'queued', 0, 0, 'u1')",
      );
    });
    assert.throws(() => {
      database.exec(
        "insert into jobs (item_id, kind, state, attempts, next_attempt_at, address) values (2, 'unknown', 'queued', 0, 0, 'u2')",
      );
    }, /jobs_values/u);
    database.close();
  });
});
