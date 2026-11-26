import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { utf8Length } from "../src/core/contract/encoding.ts";
import { ItemReadResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { INLINE_TEXT_BYTES } from "../src/core/contract/limits.ts";
import { Instance, type Json, SECRET_KEY } from "./instance.ts";
import { saveProvider, until } from "./library-fixtures.ts";
import { DIGEST, xClient } from "./x-thread-client.ts";
import {
  CUT_CASES,
  CUT_LINE,
  LEFT_OUT,
  QUOTED_BLOCK,
  ROOM,
  SECOND_FACT,
  SQLITE_FACT,
  authored,
  reply,
  thread,
  withQuote,
} from "./x-thread-fixtures.ts";

const STORED = "1000000000000000005";

const STORED_LINK = `https://x.com/someone/status/${STORED}`;

const PARENT = "1000000000000000011";

const CHILD = "1000000000000000012";

describe("an X thread is stored like a Reddit thread, read in the Reader and rebuilt by a newer Paste", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  const nodeIds = async (id: number) =>
    (await instance.detail(id)).comments.nodes.map((node) => node.id);

  it("stores a reply to the post with a null parent and a reply to a reply with the parent's id, and lists the counts", async () => {
    const { saved } = xClient(instance);

    const item = await saved({
      url: STORED_LINK,
      content: JSON.stringify(authored(STORED)),
      digest: { ...DIGEST, keptComments: [CHILD] },
    });

    assert.equal((await instance.settledItem(item.id)).status, "ready");

    const stored = instance.database.rows(
      z.object({ id: z.string(), parent_id: z.string().nullable(), depth: z.number() }),
      "select id, parent_id, depth from thread_comments where item_id = ? order by position",
      item.id,
    );

    assert.deepEqual(
      stored.map(({ id, parent_id, depth }) => [id, parent_id, depth]),
      [
        ["1000000000000000013", null, 0],
        ["1000000000000000014", null, 0],
        ["1000000000000000011", null, 0],
        ["1000000000000000012", "1000000000000000011", 1],
        ["1000000000000000016", "1000000000000000012", 2],
        ["1000000000000000015", null, 0],
      ],
    );

    const listed = (
      await instance.read("GET", "/api/items?source=x", ItemReadResponseSchema)
    ).items.find(({ id }) => id === item.id);

    assert.deepEqual(listed?.commentCount, { filter: "kept", shown: 1, total: 6 });
  });

  it("stores the Source of the Item on its thread row and on each of its reply rows", () => {
    const id = xClient(instance).itemIdOf(STORED);

    const sources = (table: "threads" | "thread_comments") =>
      instance.database
        .rows(z.object({ source: z.string() }), `select source from ${table} where item_id = ?`, id)
        .map(({ source }) => source);
    assert.deepEqual(sources("threads"), ["x"]);
    assert.deepEqual(
      sources("thread_comments"),
      Array.from({ length: 6 }, () => "x"),
    );
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
    const first = generationOf(id);

    await saved({
      url: STORED_LINK,
      content: JSON.stringify(
        thread(
          [21n, 22n, 23n, 24n, 25n, 26n].map((number) => reply(number, STORED)),
          { id: STORED },
        ),
      ),
      digest: { ...DIGEST, keptComments: ["21"] },
    });
    await instance.settledItem(id);

    assert.equal(generationOf(id), first + 1);
    assert.deepEqual(await nodeIds(id), ["21"]);

    await saved({ url: STORED_LINK });
    await instance.settledItem(id);

    assert.equal(generationOf(id), first + 1);
    assert.deepEqual(await nodeIds(id), ["21"]);
  });

  it("deletes the Item with its thread rows", async () => {
    const id = xClient(instance).itemIdOf(STORED);

    assert.equal((await instance.send("DELETE", `/api/items/${String(id)}`)).status, 204);
    assert.equal(
      instance.database.count(
        "select (select count(*) from thread_comments where item_id = ?) + (select count(*) from threads where item_id = ?) as n",
        id,
        id,
      ),
      0,
    );
  });

  it("sends the eligible replies with their ids and no author name to the Digest", async () => {
    await saveProvider(instance);

    const item = await xClient(instance).saved({
      url: "https://x.com/someone/status/1000000000000000006",
      content: JSON.stringify(authored("1000000000000000006")),
    });

    const [task] = await until(
      `Item ${String(item.id)} has a Digest task`,
      () =>
        instance.database.rows(
          z.object({ inputs: z.string() }),
          "select inputs from ai_tasks where kind = 'digest' and item_id = ?",
          item.id,
        ),
      (found) => found.length > 0,
    );

    const sent = task?.inputs ?? "";
    const { comments } = z
      .object({ comments: z.array(z.object({ id: z.string() })) })
      .parse(JSON.parse(sent.slice(sent.indexOf("\n") + 1)));

    const ids = comments.map(({ id }) => id);

    assert.deepEqual(ids, [PARENT, CHILD, "1000000000000000016"]);
    assert.ok(sent.includes(SQLITE_FACT));
    assert.equal(/"1000000000000000(?:013|014|015)"|Remember the rules/u.test(sent), false, sent);
    assert.equal(/bob|carol|dave|erin|AutoModerator/iu.test(sent), false, sent);

    instance.database.exec("delete from ai_tasks where item_id = ?", item.id);
  });

  it("keeps only the replies a caller-sent Digest names that are eligible", async () => {
    const sent = [`t1_${PARENT}`, `T1_${CHILD}`, "t1_1000000000000000013", "999"];
    const item = await xClient(instance).saved({
      url: "https://x.com/someone/status/1000000000000000007",
      content: JSON.stringify(authored("1000000000000000007")),
      digest: { ...DIGEST, keptComments: sent },
    });

    await instance.settledItem(item.id);

    assert.deepEqual(
      instance.database.rows(
        z.object({ rows: z.string(), digest: z.string() }),
        "select json_group_array(id order by position) as rows, (select json_extract(digest, '$.keptComments') from digests where item_id = ?1) as digest from thread_comments where item_id = ?1 and kept = 1",
        item.id,
      ),
      [{ rows: JSON.stringify([PARENT, CHILD]), digest: JSON.stringify([PARENT, CHILD]) }],
    );
  });

  const postTextOf = async (statusId: string, content: Json): Promise<string> => {
    const item = await xClient(instance).saved({
      url: `https://x.com/someone/status/${statusId}`,
      content: JSON.stringify(content),
      digest: { ...DIGEST, keptComments: [] },
    });

    await instance.settledItem(item.id);

    return (await instance.detail(item.id)).postText ?? "";
  };

  it("saves a post whose end does not fit with a line that says so, cut at a whole character before any link, and leaves its follow-up out", async () => {
    const texts = await Promise.all(
      CUT_CASES.map(({ text }, index) => {
        const id = String(1000000000000000101n + BigInt(index));

        return postTextOf(
          id,
          thread([reply(BigInt(id) + 1n, id, { author: "someone", text: LEFT_OUT })], { id, text }),
        );
      }),
    );

    CUT_CASES.forEach(({ name, root }, index) => {
      assert.ok(texts[index] === `${root}${CUT_LINE}`, name);
    });
  });

  it("leaves out the quoted post and the follow-up of a post whose end does not fit, so the line always shows", async () => {
    const id = "1000000000000000111";

    const text = await postTextOf(
      id,
      withQuote(
        thread([reply(BigInt(id) + 1n, id, { author: "someone", text: LEFT_OUT })], {
          id,
          text: "a".repeat(999_990),
        }),
      ),
    );

    assert.ok(text === `${"a".repeat(ROOM)}${CUT_LINE}`);
  });

  it("keeps the text of a post that fits with its quoted post, on a Paste and on a Paste again", async () => {
    const id = "1000000000000000112";
    const root = "a".repeat(INLINE_TEXT_BYTES - utf8Length(QUOTED_BLOCK) - 70);
    const content = withQuote(thread([], { id, text: root }));

    assert.ok((await postTextOf(id, content)) === `${root}${QUOTED_BLOCK}`);
    assert.ok((await postTextOf(id, content)) === `${root}${QUOTED_BLOCK}`);
  });

  it("refuses a post with no follow-up and no quoted post whose text and open code block pass the limit", async () => {
    const id = "1000000000000000113";

    const reason = await xClient(instance).refused({
      url: `https://x.com/someone/status/${id}`,
      content: JSON.stringify(thread([], { id, text: `\`\`\`\n${"a".repeat(999_994)}` })),
    });

    assert.match(reason, /the post text is longer than 1000000 bytes/u);
  });

  it("stores an X link pasted with no content as a Link-only Item", async () => {
    const item = await xClient(instance).saved({
      url: "https://x.com/someone/status/1000000000000000008",
    });

    assert.equal((await instance.settledItem(item.id)).fetch, "not-requested");
  });

  it("takes a link with a leading zero in its status id for the post with the plain id", async () => {
    const item = await xClient(instance).saved({
      url: "https://x.com/someone/status/0000000000000000321",
      content: JSON.stringify(thread([reply(2n, "321")], { id: "321" })),
    });

    assert.equal(item.normalizedUrl, "https://x.com/i/status/321");
  });
});
