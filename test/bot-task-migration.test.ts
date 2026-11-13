import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { type OlderRelease, startOlderRelease } from "./older-release.ts";

const MIGRATION = "0051_bot-task-lifecycle.sql";

const SEED = `
  insert into items (id, source, kind, normalized_url, original_url, saved_at) values
    (1, 'article', 'article', 'u1', 'u1', 1), (2, 'article', 'article', 'u2', 'u2', 2);
  insert into ai_tasks (id, kind, inputs, input_revision, executor, provider, model, attempts, deadline, state, result, refusal, status, item_id) values
    (1, 'digest', '{"a":1}', 3, 'http', 'openai', 'm', 1, 100, 'done', '{"done":true}', null, null, 1),
    (2, 'related_pick', '{}', 0, 'http', null, null, 2, 200, 'failed', null, 'timeout', null, 2),
    (3, 'digest', '{}', 0, 'caller', null, null, 1, 99999999999999, 'running', null, null, null, 2);
  insert into jobs (id, kind, item_id, address, state, attempts, stale_requeues, next_attempt_at) values
    (1, 'related_pick', 1, 'a', 'done', 1, 0, 5), (2, 'fetch', 2, 'b', 'done', 0, 0, 6);
`;

const NEW_COLUMNS = ["callback_hash", "job_id", "context", "sent_at", "answered_at"];

describe("the bot task migration on a database made by the release before it", () => {
  let release: OlderRelease;

  const snapshot = (): string => {
    const database = release.sqlite();

    const found = JSON.stringify([
      database.prepare("select * from ai_tasks order by id").all(),
      database.prepare("select * from jobs order by id").all(),
      database.prepare("select name, seq from sqlite_sequence order by name").all(),
      database.prepare("select name from d1_migrations order by name").all(),
      database.prepare("select name from pragma_table_info('ai_tasks') order by cid").all(),
    ]);

    database.close();

    return found;
  };

  before(async () => {
    release = await startOlderRelease(MIGRATION, SEED);
  });

  after(() => release.close());

  it("adds the five nullable columns and keeps every row with its columns", () => {
    const database = release.sqlite();

    const columns = database
      .prepare(
        "select name, \"notnull\" as required from pragma_table_info('ai_tasks') where name in ('callback_hash', 'job_id', 'context', 'sent_at', 'answered_at') order by cid",
      )
      .all();

    const indexes = database
      .prepare(
        "select name from pragma_index_list('ai_tasks') where name like 'ai_tasks_%' order by name",
      )
      .all();

    const tasks = database
      .prepare(
        "select id, kind, inputs, input_revision, executor, provider, model, attempts, deadline, state, result, refusal, status, item_id, callback_hash, job_id, context, sent_at, answered_at from ai_tasks order by id",
      )
      .all();

    database.close();

    assert.equal(
      JSON.stringify(columns),
      JSON.stringify(NEW_COLUMNS.map((name) => ({ name, required: 0 }))),
    );

    assert.equal(
      JSON.stringify(indexes),
      JSON.stringify([
        { name: "ai_tasks_executor_state" },
        { name: "ai_tasks_item" },
        { name: "ai_tasks_job" },
      ]),
    );

    const added = {
      callback_hash: null,
      job_id: null,
      context: null,
      sent_at: null,
      answered_at: null,
    };

    assert.equal(
      JSON.stringify(tasks),
      JSON.stringify([
        {
          id: 1,
          kind: "digest",
          inputs: '{"a":1}',
          input_revision: 3,
          executor: "http",
          provider: "openai",
          model: "m",
          attempts: 1,
          deadline: 100,
          state: "done",
          result: '{"done":true}',
          refusal: null,
          status: null,
          item_id: 1,
          ...added,
        },
        {
          id: 2,
          kind: "related_pick",
          inputs: "{}",
          input_revision: 0,
          executor: "http",
          provider: null,
          model: null,
          attempts: 2,
          deadline: 200,
          state: "failed",
          result: null,
          refusal: "timeout",
          status: null,
          item_id: 2,
          ...added,
        },
        {
          id: 3,
          kind: "digest",
          inputs: "{}",
          input_revision: 0,
          executor: "caller",
          provider: null,
          model: null,
          attempts: 1,
          deadline: 99_999_999_999_999,
          state: "running",
          result: null,
          refusal: null,
          status: null,
          item_id: 2,
          ...added,
        },
      ]),
    );
  });

  it("changes nothing on a second start", () => {
    const first = snapshot();

    release.startAgain();

    assert.equal(snapshot(), first);
  });
});
