import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ErrorResponseSchema } from "../src/core/contract/error-wire.ts";
import { HighlightResponseSchema } from "../src/core/contract/highlight-contract.ts";
import {
  ItemReadResponseSchema,
  SavedItemResponseSchema,
} from "../src/core/contract/item-route-wire.ts";
import { NoteResponseSchema } from "../src/core/contract/note-contract.ts";
import { Instance, type Json } from "./instance.ts";
import { addressOf, comment, threadOf } from "./reader-thread-fixtures.ts";

interface Supplied {
  readonly page?: Json;
  readonly content?: Json;
  readonly digest?: Json;
}

const SENTENCE =
  "Copying the database file while the writer is busy can tear a page, so take the copy with the online backup command instead and check it opens cleanly before trusting it.";

const BODY = Array.from({ length: 6 }, () => SENTENCE).join("\n\n");

const ARTICLE = "https://example.com/guides/backing-up-sqlite";

const SECRET_WORD = "quokkafruit";

const DELETED_WORD = "wombatplum";

const DIGEST = {
  title: "Backing up SQLite safely",
  topic: "Databases",
  tags: ["sqlite", "backups"],
  summary:
    "Use the online backup command, not a file copy.\nCheck the copy opens before trusting it.",
  keyPoints: ["A file copy can tear a page", "The backup command is safe while writers run"],
};

const PAGE = {
  markdown: `${BODY}\n\nThe ${SECRET_WORD} rule: verify every backup by opening it.`,
  title: "Backing up SQLite",
  author: "Ada Example",
};

describe("a link the owner pastes reaches the library, and the owner finds, reads and removes it", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  const paste = (url: string, supplied: Supplied) =>
    instance.read("POST", "/api/items", SavedItemResponseSchema, { url, ...supplied });

  const listed = async (query: string) =>
    (await instance.read("GET", `/api/items${query}`, ItemReadResponseSchema)).items.map(
      ({ id }) => id,
    );

  it("publishes a supplied page with a caller-sent Digest, and the list, search and Reader show it", async () => {
    const { item: saved } = await paste(ARTICLE, { page: PAGE, digest: DIGEST });

    assert.equal(saved.status, "processing");

    const settled = await instance.settledItem(saved.id);

    assert.equal(settled.status, "ready");
    assert.equal(settled.digestTitle, DIGEST.title);
    assert.equal(settled.digestTopic, DIGEST.topic);
    assert.ok((await listed("")).includes(saved.id));
    assert.deepEqual(await listed(`?q=${SECRET_WORD}`), [saved.id]);
    assert.deepEqual(await listed("?q=unmentioned"), []);

    const reader = await instance.detail(saved.id);

    assert.equal(reader.postText?.includes(SECRET_WORD), true);
    assert.equal(reader.author, PAGE.author);
    assert.equal(reader.digest?.summary, DIGEST.summary);
    assert.deepEqual(reader.digest?.keyPoints, DIGEST.keyPoints);
  });

  it("refuses a supplied Reddit thread with a reply to a missing parent at the top", async () => {
    const id = "abc456";
    const content = threadOf(id, {}, [comment("c1", "t1_missing", "reader", SENTENCE)]);
    const answer = await instance.send("POST", "/api/items", { url: addressOf(id), content });

    assert.equal(answer.status, 400);
    assert.match(ErrorResponseSchema.parse(JSON.parse(answer.body)).error, /parent_id/u);
  });

  it("keeps one Link-only Item when an X link is pasted again as x.com, twitter.com, with a trailing slash or with tracking", async () => {
    const first = await paste("https://x.com/someone/status/1234567890", {});
    const again = await paste("https://twitter.com/someone/status/1234567890/", {});
    const mobile = await paste("https://mobile.x.com/other/status/1234567890?s=20", {});

    assert.equal(again.item.id, first.item.id);
    assert.equal(mobile.item.id, first.item.id);
    assert.equal(first.item.kind, "x-post");
    assert.equal((await instance.settledItem(first.item.id)).fetch, "not-requested");
    assert.deepEqual(await listed("?source=x"), [first.item.id]);
  });

  it("refreshes the same Item with the new page when an article link is pasted again with tracking added", async () => {
    const { item: first } = await paste(ARTICLE, { page: PAGE });

    await instance.settledItem(first.id);

    const refreshed = await paste(`${ARTICLE}?utm_source=newsletter`, {
      page: { ...PAGE, markdown: `${BODY}\n\nA corrected ending about ${SECRET_WORD}.` },
    });

    await instance.settledItem(refreshed.item.id);

    assert.equal(refreshed.item.id, first.id);
    assert.equal((await instance.detail(first.id)).postText?.includes("A corrected ending"), true);
    assert.equal((await listed("?source=article")).filter((id) => id === first.id).length, 1);
  });

  it("refuses a link to a host on the Instance's own network and accepts one on a public address", async () => {
    const refusedHosts = [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.20",
      "169.254.169.254",
      "[::1]",
    ];

    const answers = await Promise.all(
      refusedHosts.map((host) =>
        instance.send("POST", "/api/items", { url: `http://${host}:8080/admin` }),
      ),
    );

    assert.deepEqual(
      answers.map(({ status, body }) => [
        status,
        ErrorResponseSchema.parse(JSON.parse(body)).fetch,
      ]),
      refusedHosts.map(() => [400, "refused"]),
    );

    const publicHosts = ["8.8.8.8", "[2606:4700:4700::1111]"];

    const settled = await Promise.all(
      publicHosts.map(async (host) => {
        const { item } = await paste(`https://${host}/guide`, { page: PAGE });

        return (await instance.settledItem(item.id)).status;
      }),
    );

    assert.deepEqual(
      settled,
      publicHosts.map(() => "ready"),
    );
  });

  it("saves a Highlight and a Note, reads them back, and removes the Item from the list and search when it is deleted", async () => {
    const { item: saved } = await paste("https://example.com/guides/highlight-me", {
      page: {
        ...PAGE,
        markdown: `${PAGE.markdown}\n\nThe ${DELETED_WORD} note stays with this Item.`,
      },
      digest: DIGEST,
    });

    await instance.settledItem(saved.id);

    const reader = await instance.detail(saved.id);
    const text = reader.postText ?? "";
    const quote = "online backup command";
    const start = text.indexOf(quote);

    assert.notEqual(start, -1);

    const { highlight } = await instance.read(
      "POST",
      `/api/items/${String(saved.id)}/highlights`,
      HighlightResponseSchema,
      {
        target: { kind: "post" },
        revision: reader.highlights.revisions.post,
        selector: {
          exact: quote,
          prefix: text.slice(Math.max(0, start - 32), start),
          suffix: text.slice(start + quote.length, start + quote.length + 32),
          hint: start,
        },
      },
    );

    assert.equal(highlight.status, "attached");

    const { note } = await instance.read(
      "PUT",
      `/api/items/${String(saved.id)}/note`,
      NoteResponseSchema,
      { body: "Try this on the home server", revision: reader.note.revision },
    );

    assert.equal(note.body, "Try this on the home server");

    const kept = await instance.detail(saved.id);

    assert.deepEqual(
      kept.highlights.items.map(({ id, status }) => [id, status]),
      [[highlight.id, "attached"]],
    );
    assert.equal(kept.note.body, note.body);
    assert.deepEqual(await listed(`?q=${DELETED_WORD}`), [saved.id]);

    assert.equal((await instance.send("DELETE", `/api/items/${String(saved.id)}`)).status, 204);
    assert.equal((await instance.send("GET", `/api/items/${String(saved.id)}`)).status, 404);
    assert.equal((await listed("")).includes(saved.id), false);
    assert.deepEqual(await listed(`?q=${DELETED_WORD}`), []);
  });
});
