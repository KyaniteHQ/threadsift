import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ItemReadResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import { SECRET_KEY, exec, rows, saveProvider, until } from "./related-fixtures.ts";
import { DIGEST, xClient } from "./x-thread-client.ts";
import { SECOND_FACT, SQLITE_FACT, authored, reply, thread } from "./x-thread-fixtures.ts";

const STORED = "1000000000000000005";

const STORED_LINK = `https://x.com/someone/status/${STORED}`;

const PARENT = "t1_1000000000000000011";

const CHILD = "t1_1000000000000000012";

const NEW_REPLIES = [21n, 22n, 23n, 24n, 25n, 26n];

describe("an X thread is stored like a Reddit thread, read in the Reader and rebuilt by a newer Paste", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  const nodeIds = async (id: number) =>
    (await instance.detail(id)).comments.nodes.map((node) => node.id);

  it("stores a reply to the post with a null parent and a reply to a reply with the parent's t1_ id, and lists the counts", async () => {
    const { saved } = xClient(instance);

    const item = await saved({
      url: STORED_LINK,
      content: JSON.stringify(authored(STORED)),
      digest: { ...DIGEST, keptComments: [CHILD] },
    });

    assert.equal((await instance.settledItem(item.id)).status, "ready");

    const stored = rows(
      instance,
      z.object({ id: z.string(), parent_id: z.string().nullable(), depth: z.number() }),
      "select id, parent_id, depth from reddit_comments where item_id = ? order by position",
      item.id,
    );

    assert.deepEqual(
      stored.map(({ id, parent_id, depth }) => [id, parent_id, depth]),
      [
        ["t1_1000000000000000013", null, 0],
        ["t1_1000000000000000014", null, 0],
        ["t1_1000000000000000011", null, 0],
        ["t1_1000000000000000012", "t1_1000000000000000011", 1],
        ["t1_1000000000000000016", "t1_1000000000000000012", 2],
        ["t1_1000000000000000015", null, 0],
      ],
    );

    const listed = (
      await instance.read("GET", "/api/items?source=x", ItemReadResponseSchema)
    ).items.find(({ id }) => id === item.id);

    assert.deepEqual([listed?.commentsKept, listed?.commentsTotal], [1, 6]);
  });

  it("opens with the kept reply under its parent as context, the post's handle and no archive note", async () => {
    const detail = await instance.detail(xClient(instance).itemIdOf(STORED));

    assert.equal(detail.author, "someone");
    assert.equal(detail.comments.archive, null);
    assert.equal(detail.comments.reported, 6);
    assert.deepEqual(
      detail.comments.nodes.map((node) => [node.kind, node.id, node.depth]),
      [
        ["stub", PARENT, 0],
        ["comment", CHILD, 1],
      ],
    );

    const kept = detail.comments.nodes.find((node) => node.kind === "comment");

    assert.deepEqual(kept?.kind === "comment" ? [kept.author, kept.body, kept.score] : [], [
      "Someone",
      SECOND_FACT,
      null,
    ]);
  });

  it("replaces the thread and advances the generation on a Paste with new content, and keeps it on a Paste of the link alone", async () => {
    const { saved, itemIdOf, generationOf } = xClient(instance);
    const id = itemIdOf(STORED);
    const first = generationOf(id) ?? 0;

    await saved({
      url: STORED_LINK,
      content: JSON.stringify(
        thread(
          NEW_REPLIES.map((number) => reply(number, STORED)),
          { id: STORED },
        ),
      ),
      digest: { ...DIGEST, keptComments: ["t1_21"] },
    });
    await instance.settledItem(id);

    assert.equal(generationOf(id), first + 1);
    assert.deepEqual(await nodeIds(id), ["t1_21"]);

    await saved({ url: STORED_LINK });
    await instance.settledItem(id);

    assert.equal(generationOf(id), first + 1);
    assert.deepEqual(await nodeIds(id), ["t1_21"]);
  });

  it("deletes the Item with its thread rows", async () => {
    const id = xClient(instance).itemIdOf(STORED);

    assert.equal((await instance.send("DELETE", `/api/items/${String(id)}`)).status, 204);
    assert.deepEqual(
      rows(
        instance,
        z.object({ n: z.number() }),
        "select (select count(*) from reddit_comments where item_id = ?) + (select count(*) from reddit_threads where item_id = ?) as n",
        id,
        id,
      ),
      [{ n: 0 }],
    );
  });

  it("sends the eligible replies with their t1_ ids and no author name to the Digest", async () => {
    await saveProvider(instance);

    const item = await xClient(instance).saved({
      url: "https://x.com/someone/status/1000000000000000006",
      content: JSON.stringify(authored("1000000000000000006")),
    });

    const [task] = await until(
      () =>
        rows(
          instance,
          z.object({ inputs: z.string() }),
          "select inputs from ai_tasks where kind = 'digest' and item_id = ?",
          item.id,
        ),
      (found) => found.length > 0,
    );

    const sent = task?.inputs ?? "";

    assert.equal(
      ["011", "012", "016"].every((tail) => sent.includes(`t1_1000000000000000${tail}`)),
      true,
    );
    assert.ok(sent.includes(SQLITE_FACT));
    assert.equal(/t1_1000000000000000(?:013|014|015)|Remember the rules/u.test(sent), false, sent);
    assert.equal(/bob|carol|dave|erin|AutoModerator/iu.test(sent), false, sent);

    exec(instance, "delete from ai_tasks where item_id = ?", item.id);
  });

  it("keeps only the replies a caller-sent Digest names that are eligible", async () => {
    const item = await xClient(instance).saved({
      url: "https://x.com/someone/status/1000000000000000007",
      content: JSON.stringify(authored("1000000000000000007")),
      digest: { ...DIGEST, keptComments: [PARENT, "t1_1000000000000000013", "t1_999"] },
    });

    await instance.settledItem(item.id);

    assert.deepEqual(
      rows(
        instance,
        z.object({ id: z.string() }),
        "select id from reddit_comments where item_id = ? and kept = 1 order by position",
        item.id,
      ).map(({ id }) => id),
      [PARENT],
    );
  });

  it("stores an X link pasted with no content as a Link-only Item", async () => {
    const item = await xClient(instance).saved({
      url: "https://x.com/someone/status/1000000000000000008",
    });

    assert.equal((await instance.settledItem(item.id)).fetch, "not-requested");
  });
});
