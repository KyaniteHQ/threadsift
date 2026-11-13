import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { oembedAnswerOf } from "../src/core/x-oembed.ts";
import { CUT_BARE_ID, answerJson, postOf, recorded, withParagraph } from "./x-oembed-fixtures.ts";

describe("a post is read from the oEmbed answer X gave for its id", () => {
  it("takes the id and the handle from the answer and not from the display name", () => {
    const post = postOf("long-cut-bare.json");

    assert.deepEqual([post.id, post.handle], [CUT_BARE_ID, "fieldnotes_ana"]);
  });

  it("takes a post as cut only when its text ends in the ellipsis, before the links X appends, and the text before it is at least 250 characters with each link counted as 23", () => {
    assert.deepEqual(
      [
        "long-cut-bare.json",
        "long-cut-link.json",
        "long-cut-media.json",
        "long-cut-two-links.json",
        "typed-ellipsis.json",
        "long-whole-links.json",
        "reply-long-whole.json",
      ].map((name) => postOf(name).cut !== null),
      [true, true, true, true, false, false, false],
    );
  });

  it("reads a status that X does not show as absent, an answer of X that is not an answer as unavailable, and a 200 that cannot be read as unusable", () => {
    const html403 = "<html><title>Access denied</title></html>";

    assert.deepEqual(
      [
        oembedAnswerOf(404, recorded("status-404.html")).kind,
        oembedAnswerOf(410, "").kind,
        oembedAnswerOf(403, recorded("status-403.json")).kind,
        oembedAnswerOf(403, html403).kind,
        oembedAnswerOf(403, "").kind,
        oembedAnswerOf(429, "").kind,
        oembedAnswerOf(500, "").kind,
        oembedAnswerOf(200, "not json").kind,
        oembedAnswerOf(200, recorded("reply-short.json")).kind,
      ],
      [
        "absent",
        "absent",
        "absent",
        "unavailable",
        "unavailable",
        "unavailable",
        "unavailable",
        "unusable",
        "post",
      ],
    );
  });

  it("reads an answer with a malformed url, an unknown element or a comment in the paragraph as unusable and does not throw", () => {
    const answer = answerJson("reply-short.json");

    assert.deepEqual(
      [
        oembedAnswerOf(200, JSON.stringify({ ...answer, url: "not-a-url" })).kind,
        oembedAnswerOf(200, JSON.stringify({ ...answer, author_url: "not-a-url" })).kind,
        oembedAnswerOf(200, withParagraph("reply-short.json", "Send <span>no</span> money.")).kind,
        oembedAnswerOf(200, withParagraph("reply-short.json", "Send <!-- no --> money.")).kind,
        oembedAnswerOf(
          200,
          withParagraph(
            "reply-short.json",
            "Send <a href='https://t.co/x'><b>https://t.co/x</b></a>",
          ),
        ).kind,
      ],
      ["unusable", "unusable", "unusable", "unusable", "unusable"],
    );
  });
});
