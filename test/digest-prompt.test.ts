import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { chooseCandidateLink } from "../src/core/candidate-link.ts";
import {
  type CommentCandidate,
  DIGEST_INPUT_BYTES,
  type LinkedPage,
  digestPrompt,
  utf8Length,
} from "../src/core/digest-prompt.ts";

const NO_CATALOG = { topics: [], tags: [] };

const ITEM = { title: "A post", source: "reddit", postText: "A short post." };

function pageOf(text: string, title = "A page"): LinkedPage {
  return { url: "https://example.com/page", title, text };
}

function comment(index: number, body: string): CommentCandidate {
  return { id: `t1_c${String(index)}`, parentId: null, body };
}

const RecordSchema = z.object({
  comments: z.array(
    z.object({ id: z.string(), parentId: z.string().nullable(), body: z.string() }),
  ),
  linked: z.object({ url: z.string(), title: z.string(), text: z.string() }).optional(),
});

function readyInput(
  item: Parameters<typeof digestPrompt>[0],
  comments: readonly CommentCandidate[],
  catalog: Parameters<typeof digestPrompt>[2],
  page: LinkedPage | null,
) {
  const prompt = digestPrompt(item, comments, catalog, page);

  if (prompt.kind !== "ready") throw new Error("the prompt did not fit");

  const [, record = ""] = prompt.input.split("\n");
  const parsed = RecordSchema.parse(JSON.parse(record));

  return {
    prompt,
    bytes: utf8Length(prompt.input),
    sent: parsed.comments,
    linked: parsed.linked ?? null,
  };
}

describe("the Digest prompt carries the linked page inside the input cap", () => {
  it("is the same bytes as before when there is no linked page", () => {
    const { prompt } = readyInput(ITEM, [comment(1, "A comment.")], NO_CATALOG, null);

    assert.equal(
      prompt.input,
      '{"topics":[],"tags":[]}\n{"title":"A post","source":"reddit","postText":"A short post.","comments":[{"id":"t1_c1","parentId":null,"body":"A comment."}]}',
    );
  });

  it("gives the linked text the whole unused room when the post text and comments are short", () => {
    const { bytes, linked } = readyInput(ITEM, [], NO_CATALOG, pageOf("word ".repeat(10_000)));

    assert.equal(bytes, DIGEST_INPUT_BYTES);
    assert.equal(linked?.url, "https://example.com/page");
    assert.equal(linked?.title, "A page");
  });

  it("gives the linked text one third of the room when the post text and comments want all of it", () => {
    const longPost = { ...ITEM, postText: "p".repeat(40_000) };
    const comments = Array.from({ length: 80 }, (_, index) => comment(index, "c".repeat(300)));
    const bare = readyInput({ ...longPost, postText: "" }, [], NO_CATALOG, pageOf(""));
    const room = DIGEST_INPUT_BYTES - bare.bytes;

    const { bytes, linked, prompt } = readyInput(
      longPost,
      comments,
      NO_CATALOG,
      pageOf("l".repeat(40_000)),
    );

    assert.equal(linked?.text.length, Math.floor(room / 3));
    assert.ok(bytes <= DIGEST_INPUT_BYTES);
    assert.ok(DIGEST_INPUT_BYTES - bytes < 400);
    assert.ok(prompt.submitted.length > 0);
  });

  it("counts escapes and multibyte characters in serialised bytes and cuts at a code point", () => {
    const quotes = readyInput(ITEM, [], NO_CATALOG, pageOf('"'.repeat(20_000)));
    const emoji = readyInput(ITEM, [], NO_CATALOG, pageOf("\u{1F600}".repeat(20_000)));
    const controls = readyInput(ITEM, [], NO_CATALOG, pageOf("\u0001".repeat(20_000)));

    for (const { bytes, linked } of [quotes, emoji, controls]) {
      assert.ok(bytes <= DIGEST_INPUT_BYTES);
      assert.ok(DIGEST_INPUT_BYTES - bytes < 8);
      assert.equal(linked?.text.isWellFormed(), true);
    }

    assert.ok((quotes.linked?.text.length ?? 0) < 14_000 / 2);
  });

  it("leaves out the linked field when the URL and title alone do not fit", () => {
    const withoutPage = readyInput(ITEM, [], NO_CATALOG, null);
    const huge = readyInput(ITEM, [], NO_CATALOG, pageOf("text", "t".repeat(20_000)));

    assert.equal(huge.linked, null);
    assert.equal(huge.prompt.input, withoutPage.prompt.input);
  });

  it("still fits with a full catalog and keeps whole comments only", () => {
    const catalog = {
      topics: Array.from({ length: 200 }, (_, index) => `Topic number ${String(index)} name`),
      tags: Array.from({ length: 500 }, (_, index) => `tag-${String(index)}-with-padding`),
    };

    const comments = Array.from({ length: 60 }, (_, index) => comment(index, "w".repeat(250)));

    const { bytes, linked, prompt, sent } = readyInput(
      ITEM,
      comments,
      catalog,
      pageOf("l".repeat(30_000)),
    );

    assert.ok(bytes <= DIGEST_INPUT_BYTES);
    assert.ok((linked?.text.length ?? 0) > 0);

    assert.deepEqual(
      sent.map(({ id }) => id),
      prompt.submitted,
    );
    assert.ok(sent.every(({ body }) => body === "w".repeat(250)));
    assert.equal(prompt.counts.omitted, comments.length - sent.length);
  });

  it("sizes the output allowance from the ids it sent", () => {
    const comments = Array.from({ length: 10 }, (_, index) => comment(index, "A useful comment."));
    const { prompt } = readyInput(ITEM, comments, NO_CATALOG, pageOf("l".repeat(5000)));

    assert.equal(prompt.maxOutputTokens, 2048 + utf8Length(JSON.stringify(prompt.submitted)));
  });

  it("refuses when the fixed fields alone pass the cap, whatever the linked page", () => {
    const prompt = digestPrompt(
      { ...ITEM, title: "t".repeat(15_000) },
      [],
      NO_CATALOG,
      pageOf("x"),
    );

    assert.equal(prompt.kind, "too-large");
  });
});

describe("the link chooser picks the one link the Digest may follow", () => {
  it("reads inline, reference and automatic links of the post text, in order", () => {
    assert.equal(
      chooseCandidateLink({
        url: null,
        text: "See [a][ref] and <https://auto.example.org/x>\n\n[ref]: https://ref.example.org/y",
      }),
      "https://ref.example.org/y",
    );
    assert.equal(
      chooseCandidateLink({ url: null, text: "Just text then https://bare.example.net/z." }),
      "https://bare.example.net/z",
    );
  });

  it("prefers the target of a link post over the post text, and skips it when it fails the rules", () => {
    assert.equal(
      chooseCandidateLink({ url: "https://a.example.com/", text: "https://b.example.com/" }),
      "https://a.example.com/",
    );
    assert.equal(
      chooseCandidateLink({
        url: "https://www.youtube.com/watch?v=1",
        text: "https://b.example.com/",
      }),
      "https://b.example.com/",
    );
    assert.equal(chooseCandidateLink({ url: "https://old.reddit.com/r/x/", text: null }), null);
  });

  it("refuses a link longer than 4,096 bytes", () => {
    assert.equal(
      chooseCandidateLink({ url: `https://example.com/${"a".repeat(4100)}`, text: null }),
      null,
    );
  });
});
