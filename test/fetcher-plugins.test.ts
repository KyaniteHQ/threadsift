import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { HighlightResponseSchema } from "../src/core/contract/highlight-contract.ts";
import {
  ItemReadResponseSchema,
  SavedItemResponseSchema,
} from "../src/core/contract/item-route-wire.ts";
import { NoteResponseSchema } from "../src/core/contract/note-contract.ts";
import { fetcherFile, recordOf } from "./fetcher-record.ts";
import { Instance, type Json, SETTLE_DEADLINE_MS } from "./instance.ts";
import { selectorIn } from "./lost-highlight-fixtures.ts";

interface Supplied {
  readonly page?: Json;
}

const CodeSchema = z.object({ code: z.string() });

const PAGE = {
  markdown: "Sent from the owner's own tab. ".repeat(40) + "The quokkafruit rule.",
  title: "Backing up SQLite",
};

const SECRET_WORD = "quokkafruit";

const ONE_PARAGRAPH = Array.from({ length: 89_000 }, () => "a b c d e").join("\n");

const ONE_PARAGRAPH_OF_DELIMITERS = [
  "[a](b) ![a](b) ".repeat(450).trimEnd(),
  ...Array.from({ length: 27_000 }, () => "a] a] a* a_ ~~a~~ ~~b~~ w"),
].join("\n");

const PLUGIN_LIST = [
  "first.mts",
  "second.mts",
  "faulty.mts",
  "flaky.mts",
  "short.mts",
  "claims-every-address.mts",
]
  .map((name) => fetcherFile(name))
  .join(",");

const asked = () => recordOf(fetcherFile("claims-every-address.mts"), "asked");

const LIMIT_PAGES = [
  ["a thrown answer", "/throws"],
  ["a rejected answer", "/rejects"],
  ["a page with no title", "/no-title"],
  ["a page with videos", "/videos"],
  ["a page with an unknown field", "/extra-field"],
  ["an answer that is not a page", "/not-an-object"],
  ["a page of 1,000,001 bytes", "/size-over-limit"],
  ["a matcher that returns a Promise", "/matches-promise"],
  ["a matcher that returns a rejected Promise", "/matches-rejected-promise"],
  ["a matcher that returns a string", "/matches-string"],
  ["a matcher that returns a truthy number", "/matches-truthy"],
  ["a matcher that throws", "/matches-throws"],
] as const;

describe("a self-hoster's fetcher plug-in reads the links it claims, and only those", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ fetchers: PLUGIN_LIST });
    await instance.setUp();
  });

  after(() => instance.close());

  const paste = (url: string, supplied: Supplied = {}) =>
    instance.read("POST", "/api/items", SavedItemResponseSchema, { url, ...supplied });

  const pasted = async (url: string, supplied: Supplied = {}) => {
    const { item } = await paste(url, supplied);

    await instance.settledItem(item.id);

    return instance.detail(item.id);
  };

  it("publishes the text a plug-in returns as an Article, found by search and shown in the Reader", async () => {
    const reader = await pasted("https://first.test/guide");

    assert.equal(reader.fetch, "ok");
    assert.equal(reader.kind, "article");
    assert.equal(reader.postText?.includes("FIRSTMARKER"), true);
    assert.equal(reader.title, "From the first plug-in");

    const found = await instance.read("GET", "/api/items?q=FIRSTMARKER", ItemReadResponseSchema);

    assert.deepEqual(
      found.items.map(({ id }) => id),
      [reader.id],
    );
  });

  it("asks the plug-ins in listed order, so the first match fetches and a refusal moves on to the next", async () => {
    const shared = await pasted("https://shared.test/guide");
    const second = await pasted("https://second.test/guide");

    assert.equal(shared.postText?.includes("FIRSTMARKER"), true);
    assert.equal(shared.postText?.includes("SECONDMARKER"), false);
    assert.equal(second.postText?.includes("SECONDMARKER"), true);
  });

  it("keeps 99 words as a Link-only Item with its title and saves 100 words as an Article", async () => {
    const reader = await pasted("https://short.test/99");

    assert.equal(reader.fetch, "ok");
    assert.equal(reader.postText, null);
    assert.equal(reader.title, "A short page");

    const article = await pasted("https://short.test/100");
    assert.equal(article.kind, "article");
    assert.equal(article.postText, "word ".repeat(100).trimEnd());
  });

  it("prefers a page the Extension sent over every plug-in", async () => {
    const reader = await pasted("https://first.test/sent", { page: PAGE });

    assert.equal(reader.postText?.includes(SECRET_WORD), true);
    assert.equal(reader.postText?.includes("FIRSTMARKER"), false);
    assert.equal((await asked()).includes("https://first.test/sent"), false);
  });

  it("accepts a page of exactly 1,000,000 bytes, counting multibyte text and escapes", async () => {
    const reader = await pasted("https://faulty.test/size-at-limit");

    assert.equal(reader.fetch, "ok");
    assert.equal(reader.postText === null, false);
  });

  it("reads a page of 89,000 short lines in one paragraph as an Article", async () => {
    const started = Date.now();
    const reader = await pasted("https://first.test/one-paragraph", {
      page: { markdown: ONE_PARAGRAPH, title: "One paragraph" },
    });

    assert.equal(Date.now() - started < SETTLE_DEADLINE_MS, true);
    assert.equal(reader.fetch, "ok");
    assert.equal(reader.kind, "article");
    assert.equal(reader.postText === ONE_PARAGRAPH, true);
  });

  it("reads a page that is one paragraph of links, images, closing and stray delimiters as an Article", async () => {
    const started = Date.now();
    const reader = await pasted("https://first.test/one-paragraph-of-delimiters", {
      page: { markdown: ONE_PARAGRAPH_OF_DELIMITERS, title: "One paragraph of delimiters" },
    });

    assert.equal(Date.now() - started < SETTLE_DEADLINE_MS, true);
    assert.equal(reader.fetch, "ok");
    assert.equal(reader.kind, "article");
    assert.equal(reader.postText === ONE_PARAGRAPH_OF_DELIMITERS, true);
  });

  it("ends a page with an empty title as no-title, like any page", async () => {
    const reader = await pasted("https://faulty.test/empty-title");

    assert.equal(reader.fetch, "no-title");
    assert.equal(reader.postText, null);
  });

  for (const [name, path] of LIMIT_PAGES) {
    it(`ends the fetch unreadable, leaves a Link-only Item and asks no later plug-in for ${name}`, async () => {
      const url = `https://faulty.test${path}`;
      const reader = await pasted(url);

      assert.equal((await asked()).includes(url), false);

      assert.equal(reader.fetch, "unreadable");
      assert.equal(reader.status, "ready");
      assert.equal(reader.postText, null);
    });
  }

  it("keeps the body, the Highlight and the Note of an Item when a plug-in fails on a refresh", async () => {
    const first = await pasted("https://flaky.test/doc");
    const text = first.postText ?? "";
    const quote = "returned its text";

    await instance.read(
      "POST",
      `/api/items/${String(first.id)}/highlights`,
      HighlightResponseSchema,
      {
        target: { kind: "post" },
        revision: first.highlights.revisions.post,
        selector: selectorIn(text, quote),
      },
    );
    await instance.read("PUT", `/api/items/${String(first.id)}/note`, NoteResponseSchema, {
      body: "Kept across a failed refresh",
      revision: first.note.revision,
    });

    const refreshed = await pasted("https://flaky.test/doc");

    assert.equal(refreshed.id, first.id);
    assert.equal(refreshed.fetch, "unreadable");
    assert.equal(refreshed.postText, first.postText);
    assert.deepEqual(
      refreshed.highlights.items.map(({ status }) => status),
      ["attached"],
    );
    assert.equal(refreshed.note.body, "Kept across a failed refresh");
  });

  it("never asks a plug-in about an X link or a Reddit page that is not a post or a comment", async () => {
    const x = await pasted("https://x.com/someone/status/987654321");
    const community = await pasted("https://www.reddit.com/r/selfhosted/");

    assert.equal(x.fetch, "not-requested");
    assert.equal(community.fetch, "not-requested");
    assert.deepEqual(
      (await asked()).filter((url) => url.includes("x.com") || url.includes("/r/selfhosted/")),
      [],
    );
  });

  it("refuses a page for an X link, a GitHub link and a Reddit page that is not a post or a comment", async () => {
    const answers = await Promise.all(
      [
        "https://x.com/someone/status/55",
        "https://github.com/KyaniteHQ/threadsift",
        "https://www.reddit.com/r/selfhosted/",
      ].map((url) => instance.send("POST", "/api/items", { url, page: PAGE })),
    );

    assert.deepEqual(
      answers.map(({ status, body }) => [status, CodeSchema.parse(JSON.parse(body)).code]),
      [
        [400, "unsupported-link"],
        [400, "unsupported-link"],
        [400, "unsupported-link"],
      ],
    );
  });

  it("publishes a plug-in page for a Reddit post that holds no thread as a Reddit Item", async () => {
    const reader = await pasted("https://www.reddit.com/r/selfhosted/comments/nothr3/a_post/");

    assert.equal(reader.source, "reddit");
    assert.equal(reader.kind, "reddit-post");
    assert.equal(reader.community, "selfhosted");
    assert.equal(reader.postText?.includes("ANYMARKER"), true);
  });
});
