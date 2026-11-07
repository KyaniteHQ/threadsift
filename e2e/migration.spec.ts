import { type APIRequestContext, expect, request, test } from "@playwright/test";
import { z } from "zod";

import {
  ItemDetailResponseSchema,
  ItemListResponseSchema,
  type Item,
} from "../src/http/schemas.ts";
import { type Instance, freshDir, newCode, sessionStateOf, sessionValueOf } from "./access.ts";
import { setUpByApi } from "./fresh-screen.ts";
import { sweepNow } from "./ingest.ts";
import { SEARCH_SEED, SEEDED_LATE_WORD, SEEDED_WORD_COUNT } from "./search-seed.ts";
import { SWEEP_TIMEOUT_MS, expectFinds } from "./search.ts";
import { launchSeeded } from "./seeded.ts";
import { BEFORE_WORKERS_AI, expectHttpRowsKept } from "./workers-ai-seed.ts";

const SAVED_BEFORE_INGEST = {
  files: ["0000_init.sql", "0001_link_details.sql", "0002_access.sql"],
  sql: `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, title) VALUES
    ('other', 'link', 'https://example.com/a', 'https://example.com/a', 1111, 'A saved title'),
    ('reddit', 'link', 'https://reddit.com/r/x/comments/1', 'https://reddit.com/r/x/comments/1', 2222, NULL)`,
};

const Count = z.array(z.object({ n: z.number() }));

async function ownerOf({ url }: Instance, code: string, password: string) {
  const session = sessionValueOf(await setUpByApi(url, code, password));

  return request.newContext({ baseURL: url, storageState: sessionStateOf(session, url) });
}

async function itemsOf(owner: APIRequestContext): Promise<Item[]> {
  const { items } = ItemListResponseSchema.parse(await (await owner.get("/api/items")).json());

  return items.toSorted((left, right) => left.id - right.id);
}

function countOf(instance: Instance, statement: string): number {
  return instance.query(statement, Count)[0]?.n ?? -1;
}

test("Items stored before the ingest and article migrations are ready with a null fetch result, keep their Source, titles and saved dates, have no post text and have no job", async () => {
  test.setTimeout(180_000);
  const code = newCode();
  const instance = launchSeeded(freshDir(), code, SAVED_BEFORE_INGEST);

  try {
    const owner = await ownerOf(instance, code, "m".repeat(20));

    const details = await Promise.all(
      (await itemsOf(owner)).map(async ({ id }) =>
        ItemDetailResponseSchema.parse(await (await owner.get(`/api/items/${id}`)).json()),
      ),
    );

    await owner.dispose();

    const kept = { status: "ready", reason: null, fetch: null, postText: null, postedAt: null };

    expect(details.map(({ item }) => item)).toMatchObject([
      { id: 1, source: "other", title: "A saved title", savedAt: 1111, ...kept },
      { id: 2, source: "reddit", title: null, savedAt: 2222, ...kept },
    ]);

    expect(countOf(instance, "SELECT count(*) AS n FROM jobs")).toBe(0);
  } finally {
    instance.stop();
  }
});

const FINDS = [
  [SEEDED_LATE_WORD, [1]],
  ["abcdefghi", [1]],
  ["marmalade", [1, 3]],
  ["regency", [1]],
  ["notes", [3]],
  ["ledger", [1]],
  ["damaged", []],
] as const;

function stored(instance: Instance) {
  return {
    items: countOf(instance, "SELECT count(*) AS n FROM items"),
    digests: countOf(instance, "SELECT count(*) AS n FROM digests"),
    links: countOf(instance, "SELECT count(*) AS n FROM item_tags"),
    parts: countOf(instance, "SELECT count(*) AS n FROM search_parts"),
    fingerprints: countOf(instance, "SELECT count(*) AS n FROM search_fingerprints"),
    postText: countOf(instance, "SELECT length(post_text) AS n FROM items WHERE id = 1"),
  };
}

test("Items stored before the search migrations stay unread and whole, become searchable once the sweep reaches them, and survive a second start", async () => {
  test.setTimeout(480_000);
  const code = newCode();
  const instance = launchSeeded(freshDir(), code, SEARCH_SEED);

  try {
    const owner = await ownerOf(instance, code, "m".repeat(20));

    expect((await itemsOf(owner)).map(({ id, readState }) => [id, readState])).toEqual([
      [1, "unread"],
      [2, "unread"],
      [3, "unread"],
    ]);

    await sweepNow(owner, instance);
    await expect.poll(() => stored(instance).fingerprints, { timeout: SWEEP_TIMEOUT_MS }).toBe(3);
    await expectFinds(owner, FINDS);

    const before = stored(instance);

    expect(before).toMatchObject({
      items: 3,
      digests: 2,
      links: 2,
      postText: SEEDED_WORD_COUNT * 10 + SEEDED_LATE_WORD.length,
    });

    instance.sql("INSERT INTO search_index(search_index, rank) VALUES ('integrity-check', 1)");
    instance.restart();
    await expectFinds(owner, FINDS);
    expect(stored(instance)).toEqual(before);
    await owner.dispose();
  } finally {
    instance.stop();
  }
});

test("an HTTP settings row and an AI task stored before Workers AI keep every column, take no Provider or model, and the Provider and key columns stay in step", async () => {
  test.setTimeout(180_000);
  const code = newCode();
  const instance = launchSeeded(freshDir(), code, BEFORE_WORKERS_AI);

  try {
    const owner = await ownerOf(instance, code, "m".repeat(20));
    await expectHttpRowsKept(instance, owner);
    await owner.dispose();
  } finally {
    instance.stop();
  }
});
