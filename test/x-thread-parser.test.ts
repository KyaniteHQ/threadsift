import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { INLINE_TEXT_BYTES, X_REPLIES_MAX } from "../src/core/limits.ts";
import { parseXThread, postTitle } from "../src/core/x-thread.ts";
import type { Json } from "./instance.ts";
import { POST_ID, authored, reply, thread } from "./x-thread-fixtures.ts";

const parsed = (content: Json, statusId = POST_ID) =>
  parseXThread(JSON.stringify(content), statusId);

const refusal = (content: Json, statusId = POST_ID): string => {
  const result = parsed(content, statusId);

  assert.equal(result.kind, "refused");

  return result.kind === "refused" ? result.reason : "";
};

const ID = 2000000000000000000n;

const some = (count: number) =>
  thread(Array.from({ length: count }, (_, index) => reply(ID + BigInt(index), POST_ID)));

describe("an X thread is read into the stored thread by parseXThread", () => {
  it("lists replies after their parent, siblings by time then id and replies with no time last", () => {
    const result = parsed(authored());

    assert.equal(result.kind, "thread");

    if (result.kind !== "thread") return;

    assert.deepEqual(
      result.thread.nodes.map(({ id, parentId, depth, position }) => [
        id,
        parentId,
        depth,
        position,
      ]),
      [
        ["t1_1000000000000000013", null, 0, 0],
        ["t1_1000000000000000014", null, 0, 1],
        ["t1_1000000000000000011", null, 0, 2],
        ["t1_1000000000000000012", "t1_1000000000000000011", 1, 3],
        ["t1_1000000000000000016", "t1_1000000000000000012", 2, 4],
        ["t1_1000000000000000015", null, 0, 5],
      ],
    );
  });

  it("breaks a tie of times by the numeric id, not the text of the id", () => {
    const result = parsed(
      thread([reply(ID + 10n, POST_ID), reply(ID + 9n, POST_ID), reply(ID + 100n, POST_ID)]),
    );

    assert.deepEqual(result.kind === "thread" ? result.thread.nodes.map(({ id }) => id) : [], [
      `t1_${String(ID + 9n)}`,
      `t1_${String(ID + 10n)}`,
      `t1_${String(ID + 100n)}`,
    ]);
  });

  it("marks a joke, a bot, a bare agreement and an empty text as not eligible and stores no body for them", () => {
    const result = parsed(authored());
    const nodes = result.kind === "thread" ? result.thread.nodes : [];

    assert.deepEqual(
      nodes.map(({ eligible, body }) => [eligible, body === null]),
      [
        [false, true],
        [false, true],
        [true, false],
        [true, false],
        [true, false],
        [false, true],
      ],
    );
  });

  it("keeps the post fields: the handle, the time, the reported count, no community and no linked page", () => {
    const result = parsed(authored());

    assert.equal(result.kind, "thread");

    if (result.kind !== "thread") return;

    const { title, author, community, postedAt, reported, linkedUrl, nodes } = result.thread;

    assert.deepEqual(
      { title, author, community, postedAt, reported, linkedUrl },
      {
        title: "How do you back up a SQLite file while the app is writing to it?",
        author: "someone",
        community: null,
        postedAt: Date.parse("2026-03-04T09:00:00Z"),
        reported: 6,
        linkedUrl: null,
      },
    );
    assert.equal(nodes.find(({ id }) => id === "t1_1000000000000000011")?.score, 12);
    assert.equal(nodes.find(({ id }) => id === "t1_1000000000000000012")?.score, null);
  });

  it("takes exactly 500 replies and refuses the 501st", () => {
    assert.equal(parsed(some(X_REPLIES_MAX)).kind, "thread");
    assert.match(refusal(some(X_REPLIES_MAX + 1)), /replies more than 500 replies/u);
  });

  it("refuses each broken answer with its own reason", () => {
    const reasons = new Map<string, string>([
      ["not JSON", refusal("{")],
      ["Reddit JSON", refusal([{ kind: "Listing" }, { kind: "Listing" }])],
      ["post id not the link's", refusal(thread([], { id: "1000000000000000002" }))],
      ["duplicate reply id", refusal(thread([reply(ID, POST_ID), reply(ID, POST_ID)]))],
      ["reply with the post's id", refusal(thread([reply(BigInt(POST_ID), POST_ID)]))],
      ["unknown parent", refusal(thread([reply(ID, ID + 1n)]))],
      ["cycle", refusal(thread([reply(ID, ID + 1n), reply(ID + 1n, ID)]))],
      ["a 30-character reply id", refusal(thread([{ ...reply(ID, POST_ID), id: "1".repeat(30) }]))],
      ["a non-digit reply id", refusal(thread([{ ...reply(ID, POST_ID), id: "12ab" }]))],
      [
        "post text over the limit",
        refusal(thread([], { text: "a".repeat(INLINE_TEXT_BYTES + 1) })),
      ],
      [
        "reply text over the limit",
        refusal(thread([{ ...reply(ID, POST_ID), text: "a".repeat(INLINE_TEXT_BYTES + 1) }])),
      ],
      ["post author over 4096 bytes", refusal(thread([], { author: "a".repeat(4097) }))],
      [
        "reply author over 4096 bytes",
        refusal(thread([{ ...reply(ID, POST_ID), author: "a".repeat(4097) }])),
      ],
      ["a handle with @", refusal(thread([], { author: "@someone" }))],
      ["an unknown field", refusal({ ...thread([]), media: [] })],
    ]);

    assert.equal(new Set(reasons.values()).size, reasons.size);
    assert.match(refusal(thread([reply(ID, ID)])), /cycle/u);
    assert.match(reasons.get("cycle") ?? "", /cycle/u);
    assert.match(reasons.get("duplicate reply id") ?? "", /appears twice/u);
    assert.match(
      reasons.get("a 30-character reply id") ?? "",
      /replies\.0\.id must be at most 29 digits/u,
    );
    assert.match(reasons.get("a non-digit reply id") ?? "", /replies\.0\.id must be digits only/u);
    assert.match(
      reasons.get("post author over 4096 bytes") ?? "",
      /the post author is longer than 4096 bytes/u,
    );
  });
});

describe("the title of an X post is the first line of its text, cut at a word to 120 characters", () => {
  it("takes the first line that is not blank", () => {
    assert.equal(postTitle("\n  \nFirst line here\nSecond line"), "First line here");
  });

  it("cuts a long line at the last word that fits", () => {
    const line = `${"word ".repeat(40)}end`;

    assert.equal(postTitle(line), "word ".repeat(24).trimEnd());
    assert.ok(postTitle(line).length <= 120);
  });

  it("cuts a line with no space at 120 characters and keeps a surrogate pair whole", () => {
    assert.equal(Array.from(postTitle("😀".repeat(130))).length, 120);
  });
});
