import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { CreatedTokenResponseSchema } from "../src/core/contract/access-wire.ts";
import { INLINE_TEXT_BYTES } from "../src/core/contract/limits.ts";
import { Instance, type Json, SECRET_KEY } from "./instance.ts";
import { xAddressOf } from "./x-intake-fixtures.ts";
import { commentCount } from "./x-intake-rows.ts";
import { xClient } from "./x-thread-client.ts";
import { X_LINK, authored, reply, thread } from "./x-thread-fixtures.ts";

const SHORTENED = "1000000000000000010";

const POST = "1000000000000000003";

const LINK = `https://x.com/someone/status/${POST}`;

const PADDED_LINK = "https://x.com/someone/status/0000000000000000321";

const one = (replies: ReturnType<typeof thread>["replies"], fields: Record<string, string> = {}) =>
  JSON.stringify(thread(replies, { id: POST, ...fields }));

const withReply = (fields: Record<string, string>) => one([{ ...reply(2n, POST), ...fields }]);

const LONG = "a".repeat(INLINE_TEXT_BYTES + 1);

const AUTHOR = "a".repeat(4097);

const DIGITS = /must be digits only, with no leading zero/u;

const HANDLE = /must be the handle without @/u;

const REDDIT_THREAD = JSON.stringify([
  { kind: "Listing", data: { children: [] } },
  { kind: "Listing", data: { children: [] } },
]);

interface Refusal {
  readonly name: string;
  readonly body: Json;
  readonly reason: RegExp;
}

const body = (content: Json): Json => ({ url: LINK, content });

const REFUSALS: readonly Refusal[] = [
  {
    name: "a page",
    body: { url: LINK, page: { markdown: "A page of text.", title: "A page" } },
    reason: /only a link to an article/u,
  },
  {
    name: "a fill",
    body: { url: LINK, content: one([]), fill: true },
    reason: /only a Reddit thread can be filled/u,
  },
  {
    name: "a second text",
    body: body([one([]), one([])]),
    reason: /an X post takes one JSON text/u,
  },
  { name: "Reddit JSON", body: body(REDDIT_THREAD), reason: /not an X thread: Invalid input/u },
  { name: "text that is not JSON", body: body("{"), reason: /not readable JSON/u },
  {
    name: "an unknown field",
    body: body(JSON.stringify({ ...thread([], { id: POST }), media: [] })),
    reason: /not an X thread: Unrecognized key/u,
  },
  {
    name: "a post id that is not the link's",
    body: body(one([], { id: "1000000000000000004" })),
    reason: /post id 1000000000000000004 is not the status id in the link/u,
  },
  {
    name: "a duplicate reply id",
    body: body(one([reply(2n, POST), reply(2n, POST)])),
    reason: /reply id 2 appears twice/u,
  },
  {
    name: "a reply with the post's id",
    body: body(one([reply(BigInt(POST), POST)])),
    reason: /reply 1000000000000000003 has the id of the post/u,
  },
  {
    name: "a cycle",
    body: body(one([reply(2n, 3n), reply(3n, 2n)])),
    reason: /forms a cycle/u,
  },
  { name: "a reply that is its own parent", body: body(one([reply(2n, 2n)])), reason: /cycle/u },
  {
    name: "501 replies",
    body: body(one(Array.from({ length: 501 }, (_, index) => reply(BigInt(index + 2), POST)))),
    reason: /replies more than 500 replies/u,
  },
  {
    name: "a reply id of 30 digits",
    body: body(withReply({ id: "1".repeat(30) })),
    reason: /replies\.0\.id must be at most 29 digits/u,
  },
  { name: "a non-digit reply id", body: body(withReply({ id: "12ab" })), reason: DIGITS },
  { name: "a reply id with a leading zero", body: body(withReply({ id: "012" })), reason: DIGITS },
  {
    name: "a parent id with a leading zero",
    body: body(withReply({ parentId: "012" })),
    reason: /replies\.0\.parentId must be digits only/u,
  },
  {
    name: "a post id with a leading zero",
    body: { url: PADDED_LINK, content: one([], { id: "0321" }) },
    reason: /post\.id must be digits only, with no leading zero/u,
  },
  {
    name: "a post text over the limit",
    body: body(one([], { text: LONG })),
    reason: /the post text is longer than 1000000 bytes/u,
  },
  {
    name: "a reply text over the limit",
    body: body(withReply({ text: LONG })),
    reason: /the text of reply 2 is longer than 1000000 bytes/u,
  },
  {
    name: "a post author over 4096 bytes",
    body: body(one([], { author: AUTHOR })),
    reason: /the post author is longer than 4096 bytes/u,
  },
  {
    name: "a reply author over 4096 bytes",
    body: body(withReply({ author: AUTHOR })),
    reason: /the author of reply 2 is longer than 4096 bytes/u,
  },
  {
    name: "a handle with @",
    body: body(one([], { author: "@someone" })),
    reason: HANDLE,
  },
  {
    name: "a handle with a space before @",
    body: body(one([], { author: " @alice" })),
    reason: HANDLE,
  },
  { name: "a blank handle", body: body(one([], { author: "   " })), reason: HANDLE },
  {
    name: "a reply whose stored row is too long once escaped",
    body: body(withReply({ text: "\u0001".repeat(300_000) })),
    reason: /the stored row of reply 2 is longer than 1499998 bytes once escaped/u,
  },
];

describe("an X post sent with a Paste is refused with its own reason, and nothing is stored", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers 400 with the reason of each broken request", async () => {
    const { refused } = xClient(instance);

    const reasons = await Promise.all(REFUSALS.map((refusal) => refused(refusal.body)));

    REFUSALS.forEach(({ name, reason }, index) => {
      assert.match(reasons[index] ?? "", reason, name);
    });
  });

  it("answers 413 to three texts of 3.5 MiB that together pass 8 MiB, and stores nothing", async () => {
    const texts = Array.from({ length: 3 }, () => "a".repeat(3.5 * 1024 * 1024));
    const itemsBefore = instance.database.rowCount("items");

    const { value: token } = await instance.read(
      "POST",
      "/api/tokens",
      CreatedTokenResponseSchema,
      { name: "x-thread" },
    );
    const over = await instance.sendWithToken(token, "POST", "/api/items", {
      url: X_LINK,
      content: texts,
    });

    assert.equal(over.status, 413);
    assert.equal(instance.database.rowCount("items"), itemsBefore);
  });

  it("answers 400 for an X thread sent with a Reddit link", async () => {
    const reason = await xClient(instance).refused({
      url: "https://www.reddit.com/r/selfhosted/comments/abc123/x/",
      content: JSON.stringify(authored()),
    });

    assert.match(reason, /not a Reddit thread/u);
  });

  it("refuses a Paste of an X thread with fewer replies than the saved one and keeps the saved one", async () => {
    const { saved, refused, itemIdOf } = xClient(instance);

    await saved({ url: xAddressOf(SHORTENED), content: JSON.stringify(authored(SHORTENED)) });

    const itemId = itemIdOf(SHORTENED);
    const stored = commentCount(instance, itemId);
    const shorter = thread([reply(1000000000000000041n, SHORTENED)], { id: SHORTENED });

    assert.ok(stored > shorter.replies.length);
    assert.match(
      await refused({ url: xAddressOf(SHORTENED), content: JSON.stringify(shorter) }),
      /fewer replies/u,
    );
    assert.equal(commentCount(instance, itemId), stored);
  });
});
