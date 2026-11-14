import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Instance, type Json } from "./instance.ts";
import { TARGET, addressOf, readerOf, threadOf } from "./reader-thread-fixtures.ts";
import { SECRET_KEY } from "./related-fixtures.ts";
import { DIGEST } from "./x-thread-client.ts";

describe("the Reader links the address a Reddit link post points at", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  const { paste: send } = readerOf(() => instance);

  const paste = async (id: string, extra: Readonly<Record<string, Json>>) => {
    const saved = await send(id, extra);

    await instance.settledItem(saved);

    return saved;
  };

  const LINKS: readonly (readonly [
    string,
    string,
    (id: string) => Readonly<Record<string, Json>>,
    string | null,
  ])[] = [
    ["link1", "the target of a link post", () => ({}), TARGET],
    [
      "link2",
      "no link for a self post",
      (id) => ({ is_self: true, selftext: "Text.", url: addressOf(id) }),
      null,
    ],
    [
      "link3",
      "no link for a post with no is_self whose address is its own permalink",
      (id) => ({ is_self: null, selftext: "Text.", url: addressOf(id) }),
      null,
    ],
    [
      "link4",
      "no link when a link post names its own permalink",
      (id) => ({ url: addressOf(id) }),
      null,
    ],
    [
      "link5",
      "no link when a link post names its own short address",
      (id) => ({ url: `https://redd.it/${id}` }),
      null,
    ],
    [
      "link9",
      "no link for a post with no is_self and another address",
      () => ({ is_self: null, url: TARGET }),
      null,
    ],
    ["link6", "no link for a non-web address", () => ({ url: "ftp://example.com/file" }), null],
    ["link7", "no link for a script address", () => ({ url: "javascript:alert(1)" }), null],
    [
      "link8",
      "the address of a link post without its credentials",
      () => ({ url: "http://owner:secret@127.0.0.1:9/page" }),
      TARGET,
    ],
  ];

  const linkCase = (
    id: string,
    name: string,
    post: (id: string) => Readonly<Record<string, Json>>,
    expected: string | null,
  ) => {
    it(`stores ${name}`, async () => {
      const saved = await paste(id, { content: threadOf(id, post(id)) });

      assert.equal((await instance.detail(saved)).link, expected);
    });
  };

  for (const [id, name, post, expected] of LINKS) linkCase(id, name, post, expected);

  it("keeps the link of a link post when a second Paste stores its Digest", async () => {
    const id = await paste("fill1", { content: threadOf("fill1") });

    await paste("fill1", {
      content: threadOf("fill1"),
      digest: { ...DIGEST, keptComments: ["t1_c1"] },
    });

    assert.equal((await instance.detail(id)).link, TARGET);
  });

  it("shows the link of the newest save while an older Digest still covers the Kept comments", async () => {
    const id = await paste("newer1", {
      content: threadOf("newer1", { url: addressOf("newer1") }),
      digest: { ...DIGEST, keptComments: ["t1_c1"] },
    });

    assert.equal((await instance.detail(id)).link, null);

    await paste("newer1", { content: threadOf("newer1", { selftext: "Edited." }) });

    const detail = await instance.detail(id);

    assert.equal(detail.link, TARGET);
    assert.equal(detail.comments.view?.filter, "kept");
  });
});
