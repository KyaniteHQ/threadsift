import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { botInstance } from "./bot-task-fixtures.ts";
import { chooseGrokBot, unreadableBotKey } from "./grok-bot-provider-fixtures.ts";
import { Instance } from "./instance.ts";
import {
  DIGEST,
  LINKED,
  addressOf,
  commentsOf,
  postOf,
  SECRET_KEY,
  seedGithubCooldown,
  threadOf,
  toolsOf,
  hopLines,
  warningsDuring,
  withoutComments,
} from "./one-hop-fixtures.ts";
import { saveProvider } from "./related-fixtures.ts";

describe("a Reddit post that links to a page stores one candidate link for the Digest", () => {
  let instance: Instance;
  let tools: ReturnType<typeof toolsOf>;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    tools = toolsOf(instance);
  });

  after(() => instance.close());

  it("takes the target of a link post", async () => {
    assert.equal(
      await tools.stored("link1", { url: "https://example.com/guides/backing-up" }),
      "https://example.com/guides/backing-up",
    );
  });

  it("takes the first link of the post text when the post is a text post", async () => {
    assert.equal(
      await tools.stored("text1", {
        url: addressOf("text1"),
        selftext:
          "Read [the guide](https://docs.example.org/guide) first, then https://other.example.net/x",
      }),
      "https://docs.example.org/guide",
    );
  });

  it("skips Reddit, X, video, Reddit media, refused and relative links and images, and takes the next valid one", async () => {
    const selftext = [
      "https://www.reddit.com/r/links/comments/zz/other/",
      "https://x.com/someone/status/1234567890",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://i.redd.it/picture.png",
      "http://localhost:3000/admin",
      "![diagram](https://images.example.org/diagram.png)",
      "[relative](/docs/guide)",
      "ftp://files.example.org/archive",
      "https://good.example.com/page",
    ].join("\n\n");

    assert.equal(await tools.stored("skip1", { selftext }), "https://good.example.com/page");
  });

  it("falls back to the post text when the target of a link post fails the rules", async () => {
    assert.equal(
      await tools.stored("skip2", {
        url: "http://192.168.1.10/router",
        selftext: "The details are at https://good.example.com/details",
      }),
      "https://good.example.com/details",
    );
  });

  it("drops credentials from the stored link", async () => {
    assert.equal(
      await tools.stored("creds1", { url: "https://user:secret@example.com/private" }),
      "https://example.com/private",
    );
  });

  it("stores no candidate for a malformed or missing url and for a post with no link", async () => {
    assert.equal(await tools.stored("bad1", { url: "not a url" }), null);
    assert.equal(await tools.stored("bad2", { url: 42 }), null);
    assert.equal(await tools.stored("none1", {}), null);
    assert.equal(await tools.stored("none2", { selftext: "No link here, only words." }), null);
  });

  it("stores no candidate for a link to one comment, even when its post links to a page", async () => {
    const { item } = await tools.paste(
      "https://www.reddit.com/r/links/comments/post/_/c1/",
      JSON.stringify([postOf("post", { url: "https://example.com/article" }), commentsOf("post")]),
    );

    assert.deepEqual(tools.candidates(item.id), [{ generation: 1, linked_url: null }]);
  });

  it("replaces the candidate when the thread is saved again, and removes it with the Item", async () => {
    const first = await tools.paste(
      addressOf("again1"),
      threadOf("again1", { url: "https://example.com/first" }),
    );

    await tools.paste(
      addressOf("again1"),
      threadOf("again1", { url: "https://example.com/second" }),
    );

    assert.deepEqual(
      tools.candidates(first.item.id).map(({ linked_url: linked }) => linked),
      ["https://example.com/second"],
    );

    assert.equal(
      (await instance.send("DELETE", `/api/items/${String(first.item.id)}`)).status,
      204,
    );
    assert.deepEqual(tools.candidates(first.item.id), []);
  });

  it("counts a candidate as a Digest source: with no Provider saved the retry opens a job that makes no hop and ends as empty input with no attempt and no AI task", async () => {
    const { item } = await tools.paste(
      addressOf("only1"),
      withoutComments("only1", { url: LINKED }),
    );

    assert.equal((await instance.settledItem(item.id)).status, "ready");
    assert.deepEqual(tools.digestJobs(item.id), []);

    const { warnings, value: settled } = await warningsDuring(() => tools.askForDigest(item.id));

    assert.deepEqual(hopLines(warnings), []);
    assert.equal(settled.status, "ready");
    assert.equal(settled.digestOutcome, "none");
    assert.deepEqual(tools.digestJobs(item.id), [{ state: "done", attempts: 0 }]);
    assert.deepEqual(tools.aiTasks(item.id), []);
  });

  it("drops a caller-sent Digest that has no text to publish over, so the candidate can open a model Digest later", async () => {
    const { item } = await tools.paste(
      addressOf("pending1"),
      withoutComments("pending1", { url: LINKED }),
      DIGEST,
    );

    assert.equal((await instance.settledItem(item.id)).status, "ready");
    assert.deepEqual(tools.pendingDigests(item.id), [{ pending: 0 }]);
    assert.deepEqual(tools.digestJobs(item.id), []);
    assert.deepEqual(tools.aiTasks(item.id), []);
  });

  it("opens no Digest job for a post with no candidate and no text", async () => {
    const { item } = await tools.paste(addressOf("empty1"), withoutComments("empty1", {}));

    await tools.askForDigest(item.id);

    assert.deepEqual(tools.digestJobs(item.id), []);
  });

  it("reads the candidate of the current generation, not of a retained older one", async () => {
    const address = addressOf("gen1");

    const { item } = await tools.paste(
      address,
      threadOf("gen1", { url: LINKED, selftext: "A first text." }),
      DIGEST,
    );

    assert.equal((await instance.settledItem(item.id)).digestTitle, DIGEST.title);

    await tools.paste(address, withoutComments("gen1", {}));
    await instance.settledItem(item.id);

    assert.deepEqual(
      tools.candidates(item.id).map(({ linked_url: linked }) => linked),
      [LINKED, null],
    );

    const jobsBefore = tools.digestJobs(item.id).length;

    await tools.askForDigest(item.id);

    assert.equal(tools.digestJobs(item.id).length, jobsBefore);
  });

  it("publishes a caller-sent Digest without a model call and without a hop", async () => {
    const { warnings, value: caller } = await warningsDuring(async () => {
      const { item } = await tools.paste(
        addressOf("caller1"),
        threadOf("caller1", { url: LINKED, selftext: "Some text." }),
        DIGEST,
      );

      return { id: item.id, settled: await instance.settledItem(item.id) };
    });

    assert.equal(caller.settled.digestTitle, DIGEST.title);
    assert.deepEqual(tools.aiTasks(caller.id), [{ executor: "caller" }]);
    assert.deepEqual(hopLines(warnings), []);
  });
});

describe("a Reddit post whose only source is a candidate link ends failed with Try again when a Provider is saved and the Digest cannot run", () => {
  it("fails when the linked page cannot be read", async () => {
    const instance = await Instance.start({ secretKey: SECRET_KEY });

    try {
      await instance.setUp();
      seedGithubCooldown(instance);
      await saveProvider(instance);

      const { item } = await toolsOf(instance).paste(
        addressOf("failing1"),
        withoutComments("failing1", { url: LINKED }),
      );

      const settled = await instance.settledItem(item.id);

      assert.equal(settled.digestOutcome, "failed");
      assert.equal(settled.retry, "digest");
    } finally {
      await instance.close();
    }
  });

  it("fails when the key of Grok Bot does not open", async () => {
    const instance = await botInstance();

    try {
      assert.equal((await chooseGrokBot(instance)).status, 200);
      unreadableBotKey(instance);

      const { item } = await toolsOf(instance).paste(
        addressOf("failing2"),
        withoutComments("failing2", { url: LINKED }),
      );

      const settled = await instance.settledItem(item.id);

      assert.equal(settled.digestOutcome, "failed");
      assert.equal(settled.retry, "digest");
    } finally {
      await instance.close();
    }
  });
});
