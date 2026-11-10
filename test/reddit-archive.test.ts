import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { RedditSettingsSchema } from "../src/core/reddit-contract.ts";
import { CreatedTokenResponseSchema, SavedItemResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";

const REDDIT_LINK = "https://www.reddit.com/r/NixOS/comments/v2xpjm/big_list_of_flakes_tutorials/";

describe("the owner turns the Reddit archive fill on and off, and a pasted Reddit link stays Link-only with it off", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
  });

  after(() => instance.close());

  const setting = () => instance.read("GET", "/api/settings/reddit", RedditSettingsSchema);

  it("refuses the setting to a request with no session", async () => {
    assert.equal((await instance.send("GET", "/api/settings/reddit")).status, 401);
    assert.equal(
      (await instance.send("PUT", "/api/settings/reddit", { archiveFill: false })).status,
      401,
    );
  });

  it("refuses the setting to an agent token and keeps the owner's choice", async () => {
    await instance.setUp();

    const { value } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "an agent",
    });

    const bearer = { authorization: `Bearer ${value}` };

    assert.equal((await instance.send("GET", "/api/settings/reddit", null, bearer)).status, 403);
    assert.equal(
      (await instance.send("PUT", "/api/settings/reddit", { archiveFill: false }, bearer)).status,
      403,
    );
    assert.deepEqual(await setting(), { archiveFill: true });
  });

  it("stores the owner's choice and reads it back", async () => {
    assert.deepEqual(
      await instance.read("PUT", "/api/settings/reddit", RedditSettingsSchema, {
        archiveFill: false,
      }),
      { archiveFill: false },
    );
    assert.deepEqual(await setting(), { archiveFill: false });

    assert.deepEqual(
      await instance.read("PUT", "/api/settings/reddit", RedditSettingsSchema, {
        archiveFill: true,
      }),
      { archiveFill: true },
    );
    assert.deepEqual(await setting(), { archiveFill: true });
  });

  it("leaves a pasted Reddit link as a Link-only Item while the archive fill is off", async () => {
    await instance.read("PUT", "/api/settings/reddit", RedditSettingsSchema, {
      archiveFill: false,
    });

    const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
      url: REDDIT_LINK,
    });

    const settled = await instance.settledItem(item.id);
    const reader = await instance.detail(item.id);

    assert.equal(settled.fillable, true);
    assert.equal(reader.comments.received, 0);
    assert.equal(reader.comments.archivedAt, null);
    assert.equal(reader.postText, null);
  });
});
