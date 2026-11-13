import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { SavedItemResponseSchema, CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { Instance, type Json } from "./instance.ts";
import { SECRET_KEY } from "./related-fixtures.ts";
import { xClient } from "./x-thread-client.ts";
import { X_LINK, authored, reply, thread } from "./x-thread-fixtures.ts";

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

  it("answers 413 to three texts of 3.5 MiB that together pass 8 MiB, and stores nothing", async () => {
    const texts = Array.from({ length: 3 }, () => "a".repeat(3.5 * 1024 * 1024));
    const { count } = xClient(instance);
    const itemsBefore = count("items");

    const over = await post({ authorization: `Bearer ${token}` }, { url: X_LINK, content: texts });

    assert.equal(over.status, 413);
    assert.equal(count("items"), itemsBefore);
  });

  it("takes a link with a leading zero in its status id for the post with the plain id, and refuses an id with a leading zero", async () => {
    const { saved } = xClient(instance);
    const padded = "https://x.com/someone/status/0000000000000000321";

    const item = await saved({
      url: padded,
      content: JSON.stringify(thread([reply(2n, "321")], { id: "321" })),
    });

    assert.equal(item.normalizedUrl, "https://x.com/i/status/321");
  });

  it("answers 400 for an X thread sent with a Reddit link", async () => {
    const reason = await xClient(instance).refused({
      url: "https://www.reddit.com/r/selfhosted/comments/abc123/x/",
      content: JSON.stringify(authored()),
    });

    assert.match(reason, /not a Reddit thread/u);
  });
});
