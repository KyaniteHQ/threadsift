import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { commentsOf, threadReads } from "../src/core/thread-read.ts";
import { botInstance } from "./bot-task-fixtures.ts";
import { chooseGrokBot } from "./grok-bot-provider-fixtures.ts";
import { Instance } from "./instance.ts";
import { causeOf, readerOf, threadOf } from "./reader-thread-fixtures.ts";
import { SECRET_KEY, saveProvider, until } from "./related-fixtures.ts";

const RETRY_STEP_MS = 150_000;

async function tickLater(instance: Instance, offsetMs: number): Promise<void> {
  const real = Date.now;

  Date.now = () => real() + offsetMs;

  try {
    await instance.tick();
  } finally {
    Date.now = real;
  }
}

describe("the Reader names why a Digest has not filtered the comments", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("names 'pending' while the Digest job waits for its next try and 'failed' once its tries are used", async () => {
    const { paste, view } = readerOf(() => instance);
    const id = await paste("wait1", { content: threadOf("wait1") });

    assert.equal(
      causeOf(
        await until(
          () => view(id),
          (current) => current?.filter === "unfiltered",
        ),
      ),
      "pending",
    );

    let offset = 0;

    const failed = await until(
      async () => {
        offset += RETRY_STEP_MS;
        await tickLater(instance, offset);

        return instance.detail(id);
      },
      (detail) => detail.digestOutcome === "failed",
    );

    assert.equal(causeOf(failed.comments.view), "failed");
  });
});

describe("the Reader does not say that no Provider is saved once the Grok Bot is the Provider", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();
  });

  after(() => instance.close());

  it("names 'no-provider' while the Grok Bot is set up but not chosen, then 'not-run' or 'pending'", async () => {
    const { paste, view } = readerOf(() => instance);
    const id = await paste("bot1", { content: threadOf("bot1") });

    await instance.settledItem(id);
    assert.equal(causeOf(await view(id)), "no-provider");

    const chosen = await chooseGrokBot(instance);

    assert.equal(chosen.status, 200, chosen.body);

    const cause = causeOf(await view(id));

    assert.ok(cause === "not-run" || cause === "pending", String(cause));

    const [rows, report] = await Promise.all(threadReads(instance.core.db, id));

    assert.equal(
      causeOf(commentsOf(rows, report, 0, { outcome: "none", stored: false }).view),
      "not-run",
    );
  });
});
