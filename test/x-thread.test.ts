import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ITEM_REQUEST_BYTES } from "../src/core/limits.ts";
import { SavedItemResponseSchema, CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { Instance, type Json } from "./instance.ts";
import { SECRET_KEY } from "./related-fixtures.ts";
import { xClient } from "./x-thread-client.ts";
import { X_LINK, authored, reply, thread } from "./x-thread-fixtures.ts";

const REDDIT_THREAD = JSON.stringify([
  {
    kind: "Listing",
    data: {
      children: [
        {
          kind: "t3",
          data: {
            id: "abc123",
            title: "A post",
            author: "poster",
            subreddit: "selfhosted",
            selftext: "Body",
            created_utc: 1_700_000_000,
            num_comments: 0,
          },
        },
      ],
    },
  },
  { kind: "Listing", data: { children: [] } },
]);

const POST = "1000000000000000003";

const LINK = `https://x.com/someone/status/${POST}`;

const one = (replies: ReturnType<typeof thread>["replies"], fields: Record<string, string> = {}) =>
  JSON.stringify(thread(replies, { id: POST, ...fields }));

const LONG = "a".repeat(1_000_001);

const AUTHOR = "a".repeat(4097);

const BROKEN = [
  one([], { id: "1000000000000000004" }),
  one([reply(2n, POST), reply(2n, POST)]),
  one([reply(BigInt(POST), POST)]),
  one([reply(2n, 3n)]),
  one([reply(2n, 3n), reply(3n, 2n)]),
  one(Array.from({ length: 501 }, (_, index) => reply(BigInt(index + 2), POST))),
  one([{ ...reply(2n, POST), id: "1".repeat(30) }]),
  one([{ ...reply(2n, POST), id: "12ab" }]),
  one([], { text: LONG }),
  one([{ ...reply(2n, POST), text: LONG }]),
  one([], { author: AUTHOR }),
  one([{ ...reply(2n, POST), author: AUTHOR }]),
];

describe("a caller sends an X post with its replies with a Paste, and the library takes or refuses it", () => {
  let instance: Instance;
  let token: string;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "x-thread",
    }));
  });

  after(() => instance.close());

  const post = (headers: Record<string, string>, body: Json) =>
    instance.fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("saves for a session and for an agent token, and answers 401 signed out", async () => {
    const bySession = await xClient(instance).saved({
      url: X_LINK,
      content: JSON.stringify(authored()),
    });

    const withToken = await post(
      { authorization: `Bearer ${token}` },
      {
        url: "https://x.com/someone/status/1000000000000000002",
        content: JSON.stringify(authored("1000000000000000002")),
      },
    );

    assert.equal(withToken.status, 201);
    assert.notEqual(SavedItemResponseSchema.parse(await withToken.json()).item.id, bySession.id);

    const anonymous = await post({}, { url: X_LINK, content: JSON.stringify(authored()) });

    assert.equal(anonymous.status, 401);
  });

  it("answers 413 to a body over 8 MiB before it reads the content", async () => {
    const over = await post(
      { authorization: `Bearer ${token}` },
      { url: X_LINK, content: "a".repeat(ITEM_REQUEST_BYTES) },
    );

    assert.equal(over.status, 413);
  });

  it("answers 400 for a page, a fill, a second answer and Reddit JSON on an X link, and stores nothing", async () => {
    const { refused } = xClient(instance);

    const reasons = [
      await refused({ url: LINK, page: { markdown: "A page of text.", title: "A page" } }),
      await refused({ url: LINK, content: one([]), fill: true }),
      await refused({ url: LINK, content: [one([]), one([])] }),
      await refused({ url: LINK, content: REDDIT_THREAD }),
    ];

    assert.equal(new Set(reasons).size, reasons.length);
  });

  it("takes a link with a leading zero in its status id for the post with the plain id, and refuses an id with a leading zero", async () => {
    const { saved, refused } = xClient(instance);
    const padded = "https://x.com/someone/status/0000000000000000321";

    const item = await saved({
      url: padded,
      content: JSON.stringify(thread([reply(2n, "321")], { id: "321" })),
    });

    assert.equal(item.normalizedUrl, "https://x.com/i/status/321");

    const reasons = await Promise.all(
      ["0321", "00"].map((id) =>
        refused({ url: padded, content: JSON.stringify(thread([], { id })) }),
      ),
    );

    assert.deepEqual(new Set(reasons).size, 1);
    assert.match(reasons[0] ?? "", /post\.id must be digits only, with no leading zero/u);
    assert.match(
      await refused({
        url: LINK,
        content: JSON.stringify(thread([{ ...reply(2n, POST), id: "012" }], { id: POST })),
      }),
      /replies\.0\.id must be digits only, with no leading zero/u,
    );
  });

  it("answers 400 for an X thread sent with a Reddit link", async () => {
    const reason = await xClient(instance).refused({
      url: "https://www.reddit.com/r/selfhosted/comments/abc123/x/",
      content: one([]),
    });

    assert.match(reason, /not a Reddit thread/u);
  });

  it("answers 400 with its own reason for each broken thread, and stores nothing", async () => {
    const { refused } = xClient(instance);
    const reasons = [];

    for (const content of BROKEN) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each refusal compares the stored rows before and after.
      reasons.push(await refused({ url: LINK, content }));
    }

    assert.equal(new Set(reasons).size, reasons.length);
  });
});
