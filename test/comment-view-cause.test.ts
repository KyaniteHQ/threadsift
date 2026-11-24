import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { botInstance, chooseGrokBot } from "./bot-task-fixtures.ts";
import { atClock } from "./clock-fixtures.ts";
import { Instance } from "./instance.ts";
import { causeOf, readerOf, threadOf } from "./reader-thread-fixtures.ts";
import { SECRET_KEY, saveProvider, until } from "./related-fixtures.ts";
import { restoreLibrary } from "./restore-fixtures.ts";

const RETRY_STEP_MS = 150_000;

function tickLater(instance: Instance, offsetMs: number): Promise<void> {
  const real = Date.now;

  return atClock(
    () => real() + offsetMs,
    () => instance.tick(),
  );
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

  it("names 'no-provider' while the Grok Bot is set up but not chosen, then 'pending'", async () => {
    const { paste, view } = readerOf(() => instance);
    const id = await paste("bot1", { content: threadOf("bot1") });

    await instance.settledItem(id);
    assert.equal(causeOf(await view(id)), "no-provider");

    const chosen = await chooseGrokBot(instance);

    assert.equal(chosen.status, 200, chosen.body);

    assert.deepEqual(await view(id), {
      filter: "unfiltered",
      cause: "pending",
      count: { filter: "unfiltered", shown: 3, total: 6 },
    });
  });
});

it("shows not-run for a restored thread with no Digest in an Instance with a Provider", async (context) => {
  const from = await Instance.start();
  context.after(() => from.close());
  await from.setUp();
  const into = await Instance.start({ secretKey: SECRET_KEY });
  context.after(() => into.close());
  await into.setUp();
  await saveProvider(into);
  const id = await readerOf(() => from).paste("fresh1", { content: threadOf("fresh1") });
  await from.settledItem(id);

  await restoreLibrary({ from, into });
  assert.deepEqual((await into.detail(id)).comments.view, {
    filter: "unfiltered",
    cause: "not-run",
    count: { filter: "unfiltered", shown: 3, total: 6 },
  });
});
