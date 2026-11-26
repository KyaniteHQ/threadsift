import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { botInstance, selectGrokBot } from "./bot-task-fixtures.ts";
import { selectorIn } from "./highlight-selector.ts";
import { Instance, type Json, SECRET_KEY } from "./instance.ts";
import { until } from "./library-fixtures.ts";
import { FACT, causeOf, comment, readerOf, threadOf } from "./reader-thread-fixtures.ts";
import { restoreLibrary } from "./restore-fixtures.ts";
import { DIGEST, xClient } from "./x-thread-client.ts";
import { authored, reply, thread } from "./x-thread-fixtures.ts";

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

  it("shows every comment that passes step 1 with the cause 'no-provider', counts them in the list row", async () => {
    const id = await paste("none1", { content: threadOf("none1") });
    const row = await listed(id);

    assert.deepEqual(await view(id), {
      filter: "unfiltered",
      cause: "no-provider",
      count: { filter: "unfiltered", shown: 3, total: 6 },
    });
    assert.deepEqual(await nodes(id), ["comment:c1", "stub:c2", "comment:c3", "comment:c6"]);
    assert.deepEqual(row?.commentCount, { filter: "unfiltered", shown: 3, total: 6 });
  });

  it("shows the Kept comments, the stub of a dropped parent once a Digest covers the thread", async () => {
    const id = await paste("kept1", {
      content: threadOf("kept1"),
      digest: { ...DIGEST, keptComments: ["c3"] },
    });

    const row = await listed(id);

    assert.deepEqual(await view(id), {
      filter: "kept",
      count: { filter: "kept", shown: 1, total: 6 },
    });
    assert.deepEqual(await nodes(id), ["stub:c2", "comment:c3"]);
    assert.deepEqual(row?.commentCount, { filter: "kept", shown: 1, total: 6 });
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
    const revision = detail.highlights.revisions.comments;

    assert.ok(revision !== undefined, "the Reader names the revision of the comments");
    const body = `${FACT} First.`;
    const selector = selectorIn(body, "sqlite3 app.db");

    const shown = await instance.send("POST", path, {
      target: { kind: "comment", commentId: "c1" },
      revision,
      selector,
    });

    assert.equal(shown.status, 201, shown.body);

    const prefixed = await instance.send("POST", path, {
      target: { kind: "comment", commentId: "t1_c1" },
      revision,
      selector,
    });

    assert.equal(prefixed.status, 400, prefixed.body);

    const hidden = await instance.send("POST", path, {
      target: { kind: "comment", commentId: "c5" },
      revision,
      selector: { exact: "lol", prefix: "", suffix: "", hint: 0 },
    });

    assert.equal(hidden.status, 404);

    await paste("mark1", {
      content: threadOf("mark1"),
      digest: { ...DIGEST, keptComments: ["c6"] },
    });

    assert.deepEqual(await nodes(id), ["comment:c1", "comment:c6"]);
    assert.deepEqual((await listed(id))?.commentCount, { filter: "kept", shown: 2, total: 6 });
  });

  it("shows an author's reply to a missing X parent under one Context stub with its sibling and its own reply", async () => {
    const content = thread(
      [
        reply(160n, 150n),
        reply(170n, 120n),
        reply(150n, 120n, { author: "someone" }),
        reply(180n, 100n),
      ],
      { id: "100" },
    );
    const item = await xClient(instance).saved({
      url: "https://x.com/someone/status/100",
      content: JSON.stringify(content),
    });

    await instance.settledItem(item.id);
    const { postText, comments } = await instance.detail(item.id);

    assert.equal(postText, content.post.text);
    assert.deepEqual(
      comments.nodes.map((node) => [
        node.kind,
        node.id,
        node.parentId,
        node.depth,
        node.kind === "stub" ? node.reason : null,
      ]),
      [
        ["comment", "180", null, 0, null],
        ["stub", "120", null, 0, "not-saved"],
        ["comment", "150", "120", 1, null],
        ["comment", "160", "150", 2, null],
        ["comment", "170", "120", 1, null],
      ],
    );
    assert.equal(comments.received, 4);
    assert.deepEqual(comments.view, {
      filter: "unfiltered",
      cause: "no-provider",
      count: { filter: "unfiltered", shown: 4, total: 4 },
    });
  });

  it("follows the same rule for an X thread", async () => {
    const { saved, itemIdOf } = xClient(instance);

    await saved({
      url: "https://x.com/someone/status/1000000000000000001",
      content: JSON.stringify(authored()),
    });

    const id = itemIdOf("1000000000000000001");

    await until(
      `Item ${String(id)} shows its comments`,
      () => view(id),
      (current) => current?.filter !== "absent",
    );

    assert.deepEqual(await nodes(id), [
      "comment:1000000000000000011",
      "comment:1000000000000000012",
      "comment:1000000000000000016",
    ]);
  });
});

it("shows the older Digest cause when a restored thread has newer comments than its page Digest", async (context) => {
  const source = await botInstance();
  context.after(() => source.close());
  const restored = await Instance.start();
  context.after(() => restored.close());
  await restored.setUp();

  const { paste, view } = readerOf(() => source);
  const id = await paste("older1", {
    page: { title: "Page", markdown: FACT.repeat(12) },
    digest: DIGEST,
  });
  await until(
    `Item ${String(id)} has a Digest`,
    () => source.detail(id),
    (detail) => detail.digest !== null,
  );
  await selectGrokBot(source);
  await paste("older1", { content: threadOf("older1") });
  assert.equal(causeOf(await view(id)), "pending");

  await restoreLibrary({ from: source, into: restored });
  assert.deepEqual((await restored.detail(id)).comments.view, {
    filter: "unfiltered",
    cause: "older",
    count: { filter: "unfiltered", shown: 3, total: 6 },
  });
});
