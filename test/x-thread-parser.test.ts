import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { X_REPLIES_MAX } from "../src/core/limits.ts";
import { parseXThread } from "../src/core/x-thread.ts";
import type { Json } from "./instance.ts";
import { POST_ID, authored, reply, thread } from "./x-thread-fixtures.ts";

const parsed = (content: Json, statusId = POST_ID) =>
  parseXThread(JSON.stringify(content), statusId);

const nodeIds = (content: Json): readonly string[] => {
  const result = parsed(content);

  return result.kind === "thread" ? result.thread.nodes.map(({ id }) => id) : [];
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

  it("breaks a tie of times by the numeric id, for ids of different widths and ids above 2^53", () => {
    const ids = [10n, 9n, 100n, 9007199254740993n, 9007199254740992n];

    assert.deepEqual(
      nodeIds(thread(ids.map((id) => reply(id, POST_ID)))),
      [9n, 10n, 100n, 9007199254740992n, 9007199254740993n].map((id) => `t1_${String(id)}`),
    );
  });

  it("orders siblings by the time in whole milliseconds, then by id", () => {
    const later = { postedAt: "2026-03-04T10:00:00.1239Z" };
    const earlier = { postedAt: "2026-03-04T10:00:00.1231Z" };

    assert.deepEqual(nodeIds(thread([reply(10n, POST_ID, earlier), reply(9n, POST_ID, later)])), [
      "t1_9",
      "t1_10",
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

  it("takes exactly 500 replies", () => {
    assert.equal(parsed(some(X_REPLIES_MAX)).kind, "thread");
  });
});

const titleOf = (text: string): string => {
  const result = parsed(thread([], { text }));

  return result.kind === "thread" ? result.thread.title : "";
};

describe("the title of an X post is the first line of its text, cut at a word to 120 characters", () => {
  it("takes the first line that is not blank, whichever way the lines end", () => {
    assert.equal(titleOf("\n  \nFirst line here\nSecond line"), "First line here");
    assert.equal(titleOf("First\rSecond"), "First");
    assert.equal(titleOf("First\u2028Second"), "First");
    assert.equal(titleOf("First\r\nSecond"), "First");
  });

  it("cuts a long line at the last word that fits", () => {
    const line = `${"word ".repeat(40)}end`;

    assert.equal(titleOf(line), "word ".repeat(24).trimEnd());
  });

  it("cuts a line with no space at 120 characters and keeps a surrogate pair whole", () => {
    assert.equal(Array.from(titleOf("😀".repeat(130))).length, 120);
  });
});
