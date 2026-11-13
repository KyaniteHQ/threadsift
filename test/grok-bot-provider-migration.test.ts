import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { type OlderRelease, startOlderRelease } from "./older-release.ts";

const MIGRATION = "0053_grok-bot-provider.sql";

const SEED = `
  insert into settings (id, provider, base_url, model, sealed_key) values
    (1, 'openai-compatible', 'http://127.0.0.1:9/v1', 'offline', 'sealed-by-the-release-before');
  insert into grok_bot_settings (id, webhook_url, sealed_key, updated_at) values
    (1, 'https://example.com/hook', 'sealed-bot-key', 7);
  insert into items (id, source, kind, normalized_url, original_url, saved_at) values
    (1, 'article', 'article', 'u1', 'u1', 1);
  insert into jobs (id, kind, item_id, address, state, attempts, stale_requeues, next_attempt_at, claim_expires) values
    (1, 'digest', 1, 'a', 'queued', 1, 0, 99999999999999, null);
`;

describe("the Grok Bot Provider migration on a database made by the release before it", () => {
  let release: OlderRelease;

  const rows = (statement: string) => {
    const database = release.sqlite();

    try {
      return JSON.stringify(database.prepare(statement).all());
    } finally {
      database.close();
    }
  };

  before(async () => {
    release = await startOlderRelease(MIGRATION, SEED);
  });

  after(() => release.close());

  it("keeps the saved Provider row, the saved Grok Bot settings and the queued job, with the Grok Bot not used as the Provider", () => {
    assert.equal(
      rows("select * from settings"),
      JSON.stringify([
        {
          id: 1,
          provider: "openai-compatible",
          base_url: "http://127.0.0.1:9/v1",
          model: "offline",
          sealed_key: "sealed-by-the-release-before",
        },
      ]),
    );
    assert.equal(
      rows(
        "select id, webhook_url, sealed_key, updated_at, use_as_provider from grok_bot_settings",
      ),
      JSON.stringify([
        {
          id: 1,
          webhook_url: "https://example.com/hook",
          sealed_key: "sealed-bot-key",
          updated_at: 7,
          use_as_provider: 0,
        },
      ]),
    );
    assert.equal(
      rows("select id, state, attempts from jobs"),
      JSON.stringify([{ id: 1, state: "queued", attempts: 1 }]),
    );
    assert.equal(
      rows("select revision from ai_settings_revision"),
      JSON.stringify([{ revision: 1 }]),
    );
  });

  it("changes nothing when the database starts again", () => {
    const stored = rows("select name from d1_migrations order by name");
    const columns = rows("select name from pragma_table_info('grok_bot_settings')");

    release.startAgain();

    assert.equal(rows("select name from d1_migrations order by name"), stored);
    assert.equal(rows("select name from pragma_table_info('grok_bot_settings')"), columns);
  });
});
