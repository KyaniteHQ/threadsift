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
} from "./x-oembed-fixtures.ts";

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
      ],
      [
        "tail-unverified",
        "tail-unverified",
        "verified",
        "tail-unverified",
        "tail-unverified",
        "tail-unverified",
      ],
    );
  });

  it("compares a short post that ends in an ellipsis whole, so a forged tail after it is rejected", () => {
    assert.deepEqual(
      [typed("Maybe…"), typed("Maybe… and a forged tail"), typed("Perhaps…")],
      ["verified", "rejected", "rejected"],
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
