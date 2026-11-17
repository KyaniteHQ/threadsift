import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { Instance } from "./instance.ts";

const BUSY_TIMEOUT_MS = 5000;

describe("jobs and the Log accept only known values", () => {
  let instance: Instance;
  let database: DatabaseSync;

  before(async () => {
    instance = await Instance.start();
    database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  it("refuses a Log entry with an action the code does not list, on insert and on update", () => {
    assert.throws(() => {
      database.prepare("insert into log_entries (at, action) values (0, 'unknown')").run();
    }, /log_entries_action/u);

    database.prepare("insert into log_entries (at, action) values (0, 'topic')").run();
    assert.throws(() => {
      database
        .prepare(
          "update log_entries set action = 'unknown' where id = (select max(id) from log_entries)",
        )
        .run();
    }, /log_entries_action/u);
  });

  it("refuses an unknown job kind on insert and update", () => {
    database.exec(
      "insert into items (id, source, kind, normalized_url, original_url, saved_at) values (1, 'article', 'article', 'https://example.com/job', 'https://example.com/job', 0)",
    );

    const insert = database.prepare(
      "insert into jobs (kind, item_id, address, state, next_attempt_at) values (?, 1, 'https://example.com/job', 'queued', 0)",
    );

    assert.throws(() => insert.run("unknown"), /jobs_values_check/u);
    insert.run("fetch");
    assert.throws(() => {
      database.exec("update jobs set kind = 'unknown' where item_id = 1");
    }, /jobs_values_check/u);
  });
});
