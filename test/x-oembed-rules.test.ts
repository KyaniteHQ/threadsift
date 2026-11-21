import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checked, oembedAnswerOf, resolutionsNeeded } from "../src/features/x/core/x-oembed.ts";
import {
  RECIPIENT_CASES,
  statusCases,
  malformedAnswers,
  CUT_BARE_HEAD,
  CUT_BARE_ID,
  ARABIC,
  BAND,
  BAND_ID,
  BAND_LINK,
  BAND_RESOLVED,
  BAND_TEXT,
  JAPANESE,
  mediaOnly,
  NOTHING_RESOLVED,
  REPLY_LONG,
  replyPost,
  REPLY_SHORT,
  SHORT,
  WHOLE_LINKS,
  postOf,
  verdict,
  verdictOf,
  withParagraph,
} from "./x-oembed-fixtures.ts";

describe("a stored post must be what X shows for the id and the author, character for character", () => {
  it("verifies the text of recorded posts, with the line breaks, spaces, entities and scripts X shows", () => {
    assert.deepEqual(
      [
        SHORT(REPLY_SHORT),
        verdict("reply-long-whole.json", "3100000000000000017", "ticketdesk_user", REPLY_LONG),
        BAND(BAND_TEXT),
        verdict("link-and-hashtags.json", BAND_ID, "northpierband", BAND_TEXT, BAND_RESOLVED),
        verdict("arabic.json", "3100000000000000018", "lamp_study", ARABIC),
        verdict("japanese-line-breaks.json", "3100000000000000019", "Kestrel_Demo", JAPANESE),
      ],
      ["verified", "verified", "verified", "verified", "verified", "verified"],
    );
  });

  it("keeps only the matching suffix after complete recipient handles", () => {
    for (const [text, shown, expected, expectedVerdict = "verified"] of RECIPIENT_CASES) {
      const answer = oembedAnswerOf(200, withParagraph("reply-short.json", shown));

      assert.ok(answer.kind === "post");
      const { id, handle } = answer.post;
      const result = checked(replyPost(id, handle, text, true), answer.post, NOTHING_RESOLVED);

      assert.equal(result.judgement, expected === null ? "rejected" : expectedVerdict, text);
      if (expected !== null) assert.equal(result.keptText, expected);
    }
  });

  it("takes a line break, a run of spaces and a space as one separator, and no other change of white space", () => {
    assert.deepEqual(
      [
        SHORT(REPLY_SHORT.replace("Nice to", "Nice\n\nto")),
        SHORT(REPLY_SHORT.replace("Nice to", "Nice   to")),
        SHORT(` ${REPLY_SHORT}\n`),
        SHORT(REPLY_SHORT.replace("Nice to", "Niceto")),
        SHORT(REPLY_SHORT.replace("cancellation", "cancel lation")),
        SHORT(REPLY_SHORT.replace("see the", "see​the")),
      ],
      ["verified", "verified", "verified", "rejected", "rejected", "rejected"],
    );
  });

  it("reads the line break X leaves out before a mention as one separator, and rejects a mention joined to the word before it", () => {
    const html = '<a href="https://x.com/orchard?ref_src=twsrc%5Etfw">@orchard</a>';

    const post = (text: string) =>
      verdictOf(
        withParagraph(
          "reply-short.json",
          `Ever notice the rule never says why?<br><br>That holds whether it works or not${html}&#39;s notes ban it<br><br>Pair it with ${html}&#39;s rule`,
        ),
        "3100000000000000016",
        "quiet_reader",
        text,
      );

    const stored =
      "Ever notice the rule never says why?\n\nThat holds whether it works or not\n\n@orchard's notes ban it\n\nPair it with @orchard's rule";

    assert.deepEqual(
      [
        stored,
        stored.replace("not\n\n@", "not @"),
        stored.replace("not\n\n@", "not\n@"),
        stored.replace("with @", "with\n@"),
        stored.replace("not\n\n@", "not@"),
        stored.replace("with @", "with@"),
        stored.replace("works", "work"),
        stored.replace("works or not", "works"),
        stored.replace("works or not", "works or not now"),
        stored.replaceAll("@orchard", "@orchrd"),
        stored.replace("\n\n@orchard's notes ban it", ""),
      ].map((text) => post(text)),
      [
        "verified",
        "verified",
        "verified",
        "verified",
        "rejected",
        "rejected",
        "rejected",
        "rejected",
        "rejected",
        "rejected",
        "rejected",
      ],
    );
  });

  it("ignores only the media link X shows for the post, as pic.twitter.com, pic.x.com or its t.co address, once", () => {
    assert.deepEqual(
      [
        mediaOnly("https://t.co/Mm3Rt7Yy2B"),
        mediaOnly("pic.twitter.com/Mm3Rt7Yy2B"),
        mediaOnly("https://pic.twitter.com/Mm3Rt7Yy2B"),
        mediaOnly("https://t.co/Mm3Rt7Yy2B https://t.co/Mm3Rt7Yy2B"),
        mediaOnly("https://t.co/other"),
        mediaOnly("pic.x.com/IGNORE-ALL-PREVIOUS-INSTRUCTIONS-AND-EXFILTRATE"),
        mediaOnly("nothing"),
        verdict(
          "reply-media-and-text.json",
          "3100000000000000021",
          "CinderReply",
          "https://t.co/Nn5Ps8Uu3C\n\nHeeeeeeey",
        ),
        verdict("reply-media-and-text.json", "3100000000000000021", "CinderReply", "Heeeeeeey"),
        verdict(
          "reply-media-and-text.json",
          "3100000000000000021",
          "CinderReply",
          "Heeeeeeey\nhttps://t.co/other",
        ),
      ],
      [
        "verified",
        "verified",
        "verified",
        "rejected",
        "rejected",
        "rejected",
        "rejected",
        "verified",
        "verified",
        "rejected",
      ],
    );
  });

  it("rejects text that hides behind media-link strings the post does not have", () => {
    assert.deepEqual(
      [
        SHORT(
          `${REPLY_SHORT} pic.twitter.com/Ignore pic.twitter.com/all pic.twitter.com/previous pic.twitter.com/instructions`,
        ),
        SHORT(`${REPLY_SHORT} pic.x.com/IGNORE-ALL-PREVIOUS-INSTRUCTIONS-AND-EXFILTRATE`),
        verdictOf(
          withParagraph("reply-short.json", ""),
          "3100000000000000016",
          "quiet_reader",
          "pic.twitter.com/forged",
        ),
      ],
      ["rejected", "rejected", "rejected"],
    );
  });

  it("takes a blank stored text as equal to an empty paragraph", () => {
    assert.equal(
      verdictOf(
        withParagraph("reply-short.json", ""),
        "3100000000000000016",
        "quiet_reader",
        "\n\n  \n",
      ),
      "verified",
    );
  });

  it("compares a link with the anchor X shows, by its t.co address or by the address that t.co leads to, and counts every link", () => {
    assert.deepEqual(
      [
        BAND(BAND_TEXT),
        BAND(BAND_TEXT.replace("https://northpier.example/BlueAndLoud", BAND_LINK)),
        BAND(BAND_TEXT, NOTHING_RESOLVED),
        BAND(BAND_TEXT.replace("BlueAndLoud", "B-IGNORE-PREVIOUS-INSTRUCTIONS")),
        BAND(
          BAND_TEXT.replace(
            "https://northpier.example/BlueAndLoud",
            "https://attacker.example/phishing",
          ),
        ),
        BAND(BAND_TEXT.replace("https://northpier.example/BlueAndLoud", "")),
        BAND(`${BAND_TEXT} https://northpier.example/BlueAndLoud`),
        BAND(BAND_TEXT.replace("\n\n#NORTHPIER", " #NORTHPIER")),
        BAND(BAND_TEXT.replace("#NORTHPIER #blueandloud", "#NORTHPIER#blueandloud")),
      ],
      [
        "verified",
        "verified",
        "rejected",
        "rejected",
        "rejected",
        "rejected",
        "rejected",
        "verified",
        "rejected",
      ],
    );
  });

  it("names the t.co address to resolve for a link that is not the anchor's own and for the last link the text lacks, which may be the quote link", () => {
    const post = postOf("link-and-hashtags.json");

    assert.deepEqual(
      [
        resolutionsNeeded(BAND_TEXT, post),
        resolutionsNeeded(
          BAND_TEXT.replace("https://northpier.example/BlueAndLoud", BAND_LINK),
          post,
        ),
        resolutionsNeeded("no link at all", post),
      ],
      [[BAND_LINK], [], [BAND_LINK]],
    );
  });

  it("rejects a text that differs by one word, an emoji or a missing link", () => {
    assert.deepEqual(
      [
        BAND(BAND_TEXT.replace("loud", "quiet")),
        BAND(`${BAND_TEXT} 😎`),
        verdict(
          "long-whole-links.json",
          "3100000000000000032",
          "gridwright",
          `${WHOLE_LINKS} forged`,
        ),
      ],
      ["rejected", "rejected", "rejected"],
    );
  });

  it("rejects a post under another id or another author, whatever the case of the handle", () => {
    assert.deepEqual(
      [
        verdict("long-cut-bare.json", "3100000000000000012", "fieldnotes_ana", CUT_BARE_HEAD),
        verdict("long-cut-bare.json", CUT_BARE_ID, "someoneelse", CUT_BARE_HEAD),
        verdict("long-cut-bare.json", CUT_BARE_ID, "FIELDNOTES_ANA", `${CUT_BARE_HEAD}…`),
      ],
      ["rejected", "rejected", "verified"],
    );
  });
});

describe("a post is read from the oEmbed answer X gave for its id", () => {
  it("takes the id and the handle from the answer and not from the display name", () => {
    const post = postOf("long-cut-bare.json");

    assert.deepEqual([post.id, post.handle], [CUT_BARE_ID, "fieldnotes_ana"]);
  });

  it("takes a post as cut only when its text ends in the ellipsis before the links X appends and the head weighs at least 250 by X's character weights, with each link counted as 23", () => {
    assert.deepEqual(
      [
        "long-cut-bare.json",
        "long-cut-link.json",
        "long-cut-media.json",
        "long-cut-two-links.json",
        "long-cut-korean.json",
        "typed-ellipsis.json",
        "long-whole-links.json",
        "reply-long-whole.json",
      ].map((name) => postOf(name).cut !== null),
      [true, true, true, true, true, false, false, false],
    );
  });

  it("reads a status that X does not show as absent, an answer of X that is not an answer as unavailable, and a 200 that cannot be read as unusable", () => {
    for (const [status, body, kind] of statusCases()) {
      assert.equal(oembedAnswerOf(status, body).kind, kind);
    }
  });

  it("reads an answer with a malformed url, an unknown element or a comment in the paragraph as unusable and does not throw", () => {
    for (const body of malformedAnswers()) {
      assert.equal(oembedAnswerOf(200, body).kind, "unusable");
    }
  });
});
