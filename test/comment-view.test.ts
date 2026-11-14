import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { type CommentRow, commentsViewOf } from "../src/core/comment-view.ts";
import { Instance, type Json } from "./instance.ts";
import { FACT, comment, readerOf, threadOf } from "./reader-thread-fixtures.ts";
import { SECRET_KEY, until } from "./related-fixtures.ts";
import { DIGEST, xClient } from "./x-thread-client.ts";
import { authored } from "./x-thread-fixtures.ts";

describe("the Reader shows the comments that pass the script's first step until a Digest covers the thread, then the Kept ones", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  const { paste: send, listed, nodes, view } = readerOf(() => instance);

  const paste = async (id: string, extra: Readonly<Record<string, Json>>) => {
    const saved = await send(id, extra);

    await instance.settledItem(saved);

    return saved;
  };

  it("shows every comment that passes step 1 with the cause 'no-provider', counts them in the list row and keeps the old counts empty", async () => {
    const id = await paste("none1", { content: threadOf("none1") });
    const row = await listed(id);

    assert.deepEqual(await view(id), {
      filter: "unfiltered",
      cause: "no-provider",
      count: { filter: "unfiltered", shown: 3, total: 6 },
    });
    assert.deepEqual(await nodes(id), [
      "comment:t1_c1",
      "stub:t1_c2",
      "comment:t1_c3",
      "comment:t1_c6",
    ]);
    assert.deepEqual(row?.commentCount, { filter: "unfiltered", shown: 3, total: 6 });
    assert.deepEqual([row?.commentsKept, row?.commentsTotal], [null, null]);
  });

  it("shows the Kept comments, the stub of a dropped parent and the old counts once a Digest covers the thread", async () => {
    const id = await paste("kept1", {
      content: threadOf("kept1"),
      digest: { ...DIGEST, keptComments: ["t1_c3"] },
    });

    const row = await listed(id);

    assert.deepEqual(await view(id), {
      filter: "kept",
      count: { filter: "kept", shown: 1, total: 6 },
    });
    assert.deepEqual(await nodes(id), ["stub:t1_c2", "comment:t1_c3"]);
    assert.deepEqual(row?.commentCount, { filter: "kept", shown: 1, total: 6 });
    assert.deepEqual([row?.commentsKept, row?.commentsTotal], [1, 6]);
    assert.equal((await instance.detail(id)).comments.kept, 1);
  });

  it("says nothing was kept when a Digest covers the thread and kept none", async () => {
    const id = await paste("kept0", {
      content: threadOf("kept0"),
      digest: { ...DIGEST, keptComments: [] },
    });

    assert.deepEqual(await view(id), {
      filter: "nothing-kept",
      count: { filter: "kept", shown: 0, total: 6 },
    });
    assert.deepEqual(await nodes(id), []);
    assert.deepEqual((await listed(id))?.commentCount, { filter: "kept", shown: 0, total: 6 });
  });

  it("says the comments were removed when none passes step 1 and no Digest covers the thread, and shows no thread", async () => {
    const id = await paste("gone1", {
      content: threadOf("gone1", {}, [
        comment("c1", "t3_gone1", "AutoModerator", "Please read the rules."),
        comment("c2", "t3_gone1", "[deleted]", "[deleted]"),
        { kind: "more", data: { parent_id: "t3_gone1", children: ["c9"] } },
      ]),
    });

    assert.deepEqual(await view(id), { filter: "removed" });
    assert.deepEqual(await nodes(id), []);
    assert.equal((await listed(id))?.commentCount, null);
  });

  it("hides the section when the thread has no comment", async () => {
    const id = await paste("empty1", { content: threadOf("empty1", { num_comments: 0 }, []) });

    assert.deepEqual(await view(id), { filter: "absent" });
    assert.equal((await listed(id))?.commentCount, null);
  });

  it("lets the owner keep a Highlight on a comment the Reader shows, refuses one on a comment it does not show, and keeps the shown one after a Digest drops it", async () => {
    const id = await paste("mark1", { content: threadOf("mark1") });
    const detail = await instance.detail(id);
    const path = `/api/items/${String(id)}/highlights`;
    const revision = detail.highlights.revisions.comments ?? -1;
    const body = `${FACT} First.`;
    const quote = "sqlite3 app.db";
    const start = body.indexOf(quote);

    const selector = {
      exact: quote,
      prefix: body.slice(Math.max(0, start - 32), start),
      suffix: body.slice(start + quote.length, start + quote.length + 32),
      hint: start,
    };

    const shown = await instance.send("POST", path, {
      target: { kind: "comment", commentId: "t1_c1" },
      revision,
      selector,
    });

    assert.equal(shown.status, 201, shown.body);

    const hidden = await instance.send("POST", path, {
      target: { kind: "comment", commentId: "t1_c5" },
      revision,
      selector: { exact: "lol", prefix: "", suffix: "", hint: 0 },
    });

    assert.equal(hidden.status, 404);

    await paste("mark1", {
      content: threadOf("mark1"),
      digest: { ...DIGEST, keptComments: ["t1_c6"] },
    });

    assert.deepEqual(await nodes(id), ["comment:t1_c1", "comment:t1_c6"]);
    assert.deepEqual((await listed(id))?.commentCount, { filter: "kept", shown: 2, total: 6 });
  });

  it("follows the same rule for an X thread", async () => {
    const { saved, itemIdOf } = xClient(instance);

    await saved({
      url: "https://x.com/someone/status/1000000000000000001",
      content: JSON.stringify(authored()),
    });

    const id = itemIdOf("1000000000000000001");

    await until(
      () => view(id),
      (current) => current?.filter !== "absent",
    );

    assert.deepEqual(await nodes(id), [
      "comment:t1_1000000000000000011",
      "comment:t1_1000000000000000012",
      "comment:t1_1000000000000000016",
    ]);
  });
});

const row = (id: string, readable: boolean): CommentRow => ({
  id,
  parentId: null,
  depth: 0,
  kind: "comment",
  eligible: true,
  kept: false,
  readable,
  author: readable ? "someone" : null,
  body: readable ? "A comment." : null,
  score: readable ? 1 : null,
  postedAt: readable ? 1_700_000_000_000 : null,
});

describe("the view of a thread whose stored Digest does not cover it", () => {
  it("names the cause 'older' whatever the Provider and the outcome say", () => {
    const { view } = commentsViewOf([row("t1_a", true), row("t1_b", true)], {
      reported: 2,
      archive: null,
      published: false,
      digest: { outcome: "none", stored: true, provider: false },
    });

    assert.deepEqual(view, {
      filter: "unfiltered",
      cause: "older",
      count: { filter: "unfiltered", shown: 2, total: 2 },
    });
  });
});
