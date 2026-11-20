import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Judged } from "../src/core/contract/x-verdict.ts";
import type { XReply, XThreadValue } from "../src/core/contract/x-wire.ts";
import { progressOf, sliceOf, startingJudged } from "../src/core/x/x-verify-state.ts";

const ROOT = "3100000000000000011";
const FIRST = "3100000000000000101";
const SECOND = "3100000000000000102";
const THIRD = "3100000000000000103";

const reply = (id: string, parentId: string, text = "a reply"): XReply => ({
  id,
  parentId,
  author: "someone",
  text,
  postedAt: null,
  likes: null,
  images: [],
});

const thread = (replies: readonly XReply[], reported: number | null = replies.length) =>
  ({
    post: {
      id: ROOT,
      author: "fieldnotes_ana",
      text: "the post",
      postedAt: null,
      replies: reported,
      images: [],
      quoted: [],
    },
    replies,
  }) satisfies XThreadValue;

const CHAIN = thread([reply(FIRST, ROOT), reply(SECOND, FIRST), reply(THIRD, SECOND)]);

const idsOf = (value: XThreadValue) => value.replies.map(({ id }) => id);

describe("a thread is shown only as far as every post of it was judged", () => {
  it("asks for the posts not judged yet, root first, and shows nothing while one is pending", () => {
    const judged: Judged = { [ROOT]: "verified", [FIRST]: "verified" };
    const progress = progressOf(CHAIN, judged);

    assert.equal(progress.kind, "asking");
    assert.deepEqual(progress.kind === "asking" ? progress.pending.map(({ id }) => id) : null, [
      SECOND,
      THIRD,
    ]);
    assert.equal(progressOf(CHAIN, {}).kind, "asking");
  });

  it("keeps every post judged verified or with an unverified tail, and counts the tails", () => {
    const progress = progressOf(CHAIN, {
      [ROOT]: "tail-unverified",
      [FIRST]: "verified",
      [SECOND]: "tail-unverified",
      [THIRD]: "verified",
    });

    assert.deepEqual(
      progress.kind === "ready"
        ? [idsOf(progress.thread), progress.dropped, progress.unverifiedTails]
        : null,
      [[FIRST, SECOND, THIRD], 0, 2],
    );
  });

  it("drops a rejected reply, counts it, moves its replies to the nearest reply that stays and raises the reported count", () => {
    const progress = progressOf(CHAIN, {
      [ROOT]: "verified",
      [FIRST]: "verified",
      [SECOND]: "rejected",
      [THIRD]: "verified",
    });

    assert.equal(progress.kind, "ready");

    if (progress.kind !== "ready") return;

    assert.deepEqual(idsOf(progress.thread), [FIRST, THIRD]);
    assert.deepEqual(
      progress.thread.replies.map(({ parentId }) => parentId),
      [ROOT, FIRST],
    );
    assert.equal(progress.dropped, 1);
    assert.equal(progress.thread.post.replies, 3);
  });

  it("moves a reply to the post when every reply above it was dropped, and does not count a tail of a dropped reply", () => {
    const progress = progressOf(CHAIN, {
      [ROOT]: "verified",
      [FIRST]: "rejected",
      [SECOND]: "rejected",
      [THIRD]: "tail-unverified",
    });

    assert.deepEqual(
      progress.kind === "ready"
        ? [progress.thread.replies.map(({ parentId }) => parentId), progress.unverifiedTails]
        : null,
      [[ROOT], 1],
    );
  });

  it("refuses the thread once the post is rejected, without waiting for the replies", () => {
    assert.equal(progressOf(CHAIN, { [ROOT]: "rejected" }).kind, "refused");
  });

  it("rejects a reply unless its parent is at least as recent as the post and older than the reply", () => {
    const older = reply("3100000000000000010", ROOT);
    const sideways = reply(THIRD, THIRD);
    const forward = reply(FIRST, SECOND);

    const parentBeforeRoot = reply("3100000000000000104", "3100000000000000009");

    assert.deepEqual(
      startingJudged(thread([older, sideways, forward, parentBeforeRoot, reply(SECOND, ROOT)])),
      {
        [parentBeforeRoot.id]: "rejected",
        "3100000000000000010": "rejected",
        [THIRD]: "rejected",
        [FIRST]: "rejected",
      },
    );
  });
});

const many = (count: number, text = "a reply") =>
  thread(
    Array.from({ length: count }, (_, index) =>
      reply(String(2_200_000_000_000_000_000n + BigInt(index)), ROOT, text),
    ),
  );

const SLICE_REQUESTS = 40;

describe("a verification job asks for as many posts as 40 requests allow, under the 50 subrequests per invocation of the Workers Free plan", () => {
  it("asks for the post alone first, so a rejected post costs one request", () => {
    assert.deepEqual(
      sliceOf(many(100), {}).map(({ id }) => id),
      [ROOT],
    );
  });

  it("requires full text for the post, quotes and author thread, and can keep a separate reply by the author", () => {
    const value = thread([
      { ...reply(FIRST, ROOT, "First part"), author: "FIELDNOTES_ANA" },
      { ...reply(SECOND, ROOT, "Separate reply"), author: "fieldnotes_ana" },
      reply(THIRD, ROOT),
    ]);
    const quote = { ...value.post, id: "3100000000000000009" };
    const quoted = { ...value, post: { ...value.post, quoted: [quote] } };
    const roles = [...sliceOf(quoted, {}), ...sliceOf(quoted, { [ROOT]: "verified" })];
    assert.deepEqual(
      roles.map(({ role }) => (role.kind === "reply" ? role.recipientsMayBeOmitted : role.kind)),
      ["root", "quote", false, true, true],
    );

    const progress = progressOf(quoted, {
      [ROOT]: "verified",
      [quote.id]: "verified",
      [FIRST]: "rejected",
      [SECOND]: "verified-without-recipients",
      [THIRD]: "verified",
    });
    assert.ok(progress.kind === "ready");
    assert.equal(progress.followUps, 0);
    assert.deepEqual(idsOf(progress.thread), [SECOND, THIRD]);
  });

  it("takes at most the replies that fit the request budget of a slice, two requests for each reply without links", () => {
    const slice = sliceOf(many(100), { [ROOT]: "verified" });

    assert.equal(slice.length, SLICE_REQUESTS / 2);
  });

  it("counts a request for every link of a reply that may need its address resolved and one for a quote link, and takes at least one reply", () => {
    const links = Array.from({ length: 5 }, (_, index) => `https://t.co/link${String(index)}`).join(
      " ",
    );

    const slice = sliceOf(many(100, links), { [ROOT]: "verified" });

    assert.equal(slice.length, Math.floor(SLICE_REQUESTS / 7));
    assert.equal(sliceOf(many(3, links), { [ROOT]: "verified" }).length, 3);
  });

  it("leaves nothing to ask once every post is judged", () => {
    assert.deepEqual(
      sliceOf(CHAIN, {
        [ROOT]: "verified",
        [FIRST]: "verified",
        [SECOND]: "verified",
        [THIRD]: "verified",
      }),
      [],
    );
  });
});
