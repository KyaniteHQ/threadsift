import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CUT_BARE_HEAD,
  CUT_BARE_ID,
  CUT_LINK_HEAD,
  CUT_LINK_ID,
  CUT_MEDIA_HEAD,
  CUT_MEDIA_ID,
  TWO_LINKS_HEAD,
  TWO_LINKS_ID,
  typed,
  verdict,
  verdictOf,
  withParagraph,
} from "./x-oembed-fixtures.ts";

const KOREAN_HEAD = [
  "Town library notesT도서관에서책을빌리고정원에갔다도",
  "The courtyard opens today.아침에작은정원을둘러보고새로심은꽃을보았다오후에는친구와책을읽고차를마셨다다음에는사진도찍고싶다아침에작은",
  "Weekend reading at the library.We새책을친구와함께읽었다",
  "Today.T내일다시정원으로가자내",
  "PS",
].join("\n\n");

describe("a cut post is checked by the head X shows, and its tail is left unverified", () => {
  it("verifies the head of a cut post and leaves its tail unverified, whether the cut is followed by a link, a media link or nothing", () => {
    assert.deepEqual(
      [
        verdict(
          "long-cut-bare.json",
          CUT_BARE_ID,
          "fieldnotes_ana",
          `${CUT_BARE_HEAD} a forged tail that X does not show`,
        ),
        verdict(
          "long-cut-bare.json",
          CUT_BARE_ID,
          "fieldnotes_ana",
          `${CUT_BARE_HEAD} the real remaining words of the post`,
        ),
        verdict("long-cut-bare.json", CUT_BARE_ID, "fieldnotes_ana", `${CUT_BARE_HEAD}…`),
        verdict(
          "long-cut-media.json",
          CUT_MEDIA_ID,
          "gridwright",
          `${CUT_MEDIA_HEAD} and the whole rest of the long post`,
        ),
        verdict(
          "long-cut-link.json",
          CUT_LINK_ID,
          "makerlane",
          `${CUT_LINK_HEAD} the rest https://example.com/x`,
        ),
        verdict(
          "long-cut-two-links.json",
          TWO_LINKS_ID,
          "gridwright",
          `${TWO_LINKS_HEAD} the rest of the post that X does not show`,
        ),
        verdict(
          "long-cut-korean.json",
          "3100000000000000035",
          "library_demo",
          `${KOREAN_HEAD} and the rest of the library update`,
        ),
      ],
      [
        "tail-unverified",
        "tail-unverified",
        "verified",
        "tail-unverified",
        "tail-unverified",
        "tail-unverified",
        "tail-unverified",
      ],
    );
  });

  it("compares a short post that ends in an ellipsis whole, so a forged tail after it is rejected", () => {
    const short = `${"가".repeat(123)} 👨‍👩‍👧‍👦…`;
    const answer = withParagraph("long-cut-bare.json", short);

    assert.deepEqual(
      [
        typed("Maybe…"),
        typed("Maybe… and a forged tail"),
        typed("Perhaps…"),
        verdictOf(answer, CUT_BARE_ID, "fieldnotes_ana", short),
        verdictOf(answer, CUT_BARE_ID, "fieldnotes_ana", `${short} and a forged tail`),
      ],
      ["verified", "rejected", "rejected", "verified", "rejected"],
    );
  });

  it("rejects a cut post whose head is altered or shorter than the head X shows", () => {
    assert.deepEqual(
      [
        verdict(
          "long-cut-bare.json",
          CUT_BARE_ID,
          "fieldnotes_ana",
          `${CUT_BARE_HEAD.replace("always", "never")} tail`,
        ),
        verdict("long-cut-bare.json", CUT_BARE_ID, "fieldnotes_ana", CUT_BARE_HEAD.slice(0, 100)),
        verdict("long-cut-bare.json", CUT_BARE_ID, "fieldnotes_ana", "A different post."),
        verdict(
          "long-cut-media.json",
          CUT_MEDIA_ID,
          "gridwright",
          `${CUT_MEDIA_HEAD.replace("https://t.co/Kk2Ab6Cc4D", "https://example.com/x")} tail`,
        ),
      ],
      ["rejected", "rejected", "rejected", "rejected"],
    );
  });
});
