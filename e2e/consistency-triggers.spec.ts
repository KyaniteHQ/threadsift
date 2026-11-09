import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { type Instance, launchFresh, newCode } from "./access.ts";
import { listAll } from "./api.ts";
import { ownerOf } from "./files.ts";

const Counts = z.array(z.object({ total: z.number() }));

const Ids = z.array(z.object({ id: z.number() }));

const COLUMNS =
  "source, kind, normalized_url, original_url, saved_at, status, reason, title, post_text, post_text_key";

let instance: Instance;
let owner: APIRequestContext;
let sequence = 0;

test.beforeAll(async () => {
  const code = newCode();
  instance = launchFresh(code);
  owner = await ownerOf(instance, code, "t".repeat(20));
});

test.afterAll(async () => {
  await owner.dispose();
  instance.stop();
});

function text(value: string | null | undefined): string {
  return value === undefined || value === null ? "NULL" : `'${value}'`;
}

function refuses(statement: string, label: string): void {
  expect(() => {
    instance.sql(statement);
  }, label).toThrow();
}

function insertItem(
  fields: Readonly<{
    source?: string;
    kind?: string;
    status?: string;
    reason?: string | null;
    postText?: string | null;
    postTextKey?: string | null;
  }> = {},
) {
  sequence += 1;

  const url = `https://example.com/trigger-${sequence}`;
  const { source = "other", kind = "link", status = "ready", reason = null } = fields;

  return {
    url,
    statement: `INSERT INTO items (${COLUMNS}) VALUES ('${source}', '${kind}', '${url}', '${url}', 1, '${status}', ${text(reason)}, 'T', ${text(fields.postText)}, ${text(fields.postTextKey)})`,
  };
}

function stored(url: string): number {
  const [row] = instance.query(
    `SELECT count(*) AS total FROM items WHERE normalized_url = '${url}'`,
    Counts,
  );

  return row?.total ?? -1;
}

function insertJob(itemId: number, kind: string, state: string): string {
  return `INSERT INTO jobs (kind, item_id, address, state, attempts, next_attempt_at) VALUES ('${kind}', ${itemId}, 'a', '${state}', 0, 0)`;
}

function expectRefused(fields: Parameters<typeof insertItem>[0]): void {
  const { url, statement } = insertItem(fields);

  refuses(statement, JSON.stringify(fields));
  expect(stored(url), JSON.stringify(fields)).toBe(0);
}

function expectAccepted(fields: Parameters<typeof insertItem>[0]): number {
  const { url, statement } = insertItem(fields);

  instance.sql(statement);

  const [row] = instance.query(`SELECT id FROM items WHERE normalized_url = '${url}'`, Ids);

  expect(row, JSON.stringify(fields)).toBeDefined();

  return row?.id ?? 0;
}

test("an Item row that contradicts its status, its post text pair or its source is refused, and every row the app writes is accepted", () => {
  expectAccepted({ status: "processing" });
  expectAccepted({ status: "ready" });
  expectAccepted({ status: "failed", reason: "timeout" });
  expectAccepted({ postText: "text in the row" });
  expectAccepted({ postTextKey: "items/1/post-1-1.md" });

  for (const [source, kind] of [
    ["reddit", "reddit-post"],
    ["reddit", "reddit-comment"],
    ["x", "x-post"],
    ["github", "github-repo"],
    ["article", "article"],
    ["other", "link"],
  ] as const) {
    expectAccepted({ source, kind });
  }

  expectRefused({ status: "failed" });
  expectRefused({ status: "failed", reason: "invented" });
  expectRefused({ status: "ready", reason: "timeout" });
  expectRefused({ status: "processing", reason: "gave-up" });
  expectRefused({ status: "done" });
  expectRefused({ postText: "text in the row", postTextKey: "items/1/post-1-1.md" });
  expectRefused({ source: "reddit", kind: "link" });
  expectRefused({ source: "other", kind: "article" });
  expectRefused({ kind: "podcast" });
  expectRefused({ source: "blog" });
});

test("an update that makes an Item row contradict itself is refused and leaves the row as it was", () => {
  const id = expectAccepted({ status: "ready", postText: "text in the row" });

  const row = () =>
    instance.query(
      `SELECT status, reason, post_text AS text, post_text_key AS key, source, kind FROM items WHERE id = ${id}`,
      z.array(z.looseObject({})),
    );

  const before = row();

  for (const change of [
    "status = 'failed'",
    "reason = 'timeout'",
    "status = 'failed', reason = 'invented'",
    "post_text_key = 'items/1/post-1-1.md'",
    "kind = 'article'",
    "source = 'reddit'",
  ]) {
    refuses(`UPDATE items SET ${change} WHERE id = ${id}`, change);
    expect(row(), change).toEqual(before);
  }

  instance.sql(`UPDATE items SET status = 'failed', reason = 'timeout' WHERE id = ${id}`);
  instance.sql(
    `UPDATE items SET post_text = NULL, post_text_key = 'items/${id}/p.md' WHERE id = ${id}`,
  );
  instance.sql(`UPDATE items SET status = 'ready', reason = NULL WHERE id = ${id}`);
});

test("a job row with an unknown kind or state is refused", () => {
  const id = expectAccepted({});

  for (const [kind, state] of [
    ["fetch", "queued"],
    ["digest", "running"],
    ["fetch", "done"],
  ] as const) {
    instance.sql(insertJob(id, kind, state));
    instance.sql(`DELETE FROM jobs WHERE item_id = ${id}`);
  }

  for (const [kind, state] of [
    ["thumbnail", "queued"],
    ["fetch", "paused"],
  ] as const) {
    refuses(insertJob(id, kind, state), `${kind} ${state}`);
  }

  instance.sql(insertJob(id, "fetch", "queued"));
  refuses(`UPDATE jobs SET state = 'paused' WHERE item_id = ${id}`, "state");
  refuses(`UPDATE jobs SET kind = 'thumbnail' WHERE item_id = ${id}`, "kind");
  instance.sql(`DELETE FROM jobs WHERE item_id = ${id}`);
});

test("one stored row that contradicts itself is skipped and logged, and the list still answers with the others", async () => {
  const good = expectAccepted({});

  instance.sql("DROP TRIGGER items_status_reason_insert");

  const { url, statement } = insertItem({ status: "failed" });

  instance.sql(statement);

  const [bad] = instance.query(`SELECT id FROM items WHERE normalized_url = '${url}'`, Ids);

  expect(bad).toBeDefined();

  const response = await owner.get("/api/items");

  expect(response.status()).toBe(200);

  const shown = (await listAll(owner)).map(({ id }) => id);

  expect(shown).toContain(good);
  expect(shown).not.toContain(bad?.id);
  expect(instance.logs()).toContain(`"event":"item-not-shown","itemId":${bad?.id ?? 0}`);
});
