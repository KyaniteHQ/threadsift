import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { TopicPageSchema } from "../src/core/contract/topic-overview-contract.ts";
import { Instance, SECRET_KEY } from "./instance.ts";
import { paste, saveProvider, until } from "./library-fixtures.ts";
import { lines } from "./log-fixtures.ts";
import { failureOf, overviewJobs, queueOverview, storePage } from "./overview-gap-fixtures.ts";

describe("a published Digest opens the Topic overview run when a Provider is saved", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("shows the overview as pending after publication", async () => {
    await saveProvider(instance);
    await paste(instance, "opens", { title: "Opens an overview", topic: "Overview runs" });
    const { overview } = await instance.read("GET", "/api/topics/overview%20runs", TopicPageSchema);

    assert.equal(overview.provider, true);
    assert.equal(overview.state, "pending");
  });
});

const TOPIC = "Removals";

const TOPIC_PATH = "/api/topics/removals";

const topicPage = (instance: Instance) => instance.read("GET", TOPIC_PATH, TopicPageSchema);

const saveAndPublish = (instance: Instance, slug: string) =>
  paste(instance, slug, { title: slug, topic: TOPIC });

async function removeAndRewrite(instance: Instance, id: number): Promise<void> {
  await saveProvider(instance);
  assert.equal((await instance.send("DELETE", `/api/items/${String(id)}`)).status, 204);
  assert.equal((await instance.send("POST", `${TOPIC_PATH}/overview`)).status, 202);
}

function summary({ overview, topic }: Awaited<ReturnType<typeof topicPage>>) {
  return {
    state: overview.state,
    failure: overview.failure,
    text: overview.text,
    builtFrom: overview.builtFrom,
    items: topic.itemCount,
  };
}

async function removeAndWrite(instance: Instance, id: number) {
  await removeAndRewrite(instance, id);

  return summary(
    await until(
      "the overview leaves pending",
      () => topicPage(instance),
      (page) => page.overview.state !== "pending",
    ),
  );
}

describe("a removed Item leaves the overview without a model call when nothing was added", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("keeps the text when no line cites the removed Item", async () => {
    const kept = await saveAndPublish(instance, "kept");
    const removed = await saveAndPublish(instance, "removed");

    storePage(instance, TOPIC, {
      builtFrom: "all",
      overview: `Only one Item matters [${String(kept)}]`,
    });

    assert.deepEqual(await removeAndWrite(instance, removed), {
      state: "idle",
      failure: null,
      text: `Only one Item matters [${String(kept)}]`,
      builtFrom: 1,
      items: 1,
    });
    assert.deepEqual(
      (await lines(instance)).filter((line) => line.startsWith("overview |")),
      ["overview | Removals | 0 added, 1 removed"],
    );
  });
});

describe("a removed Item that lines cite leaves those lines, without a model call", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("drops its id from shared lines and drops the lines it alone supports", async () => {
    const first = await saveAndPublish(instance, "first");
    const second = await saveAndPublish(instance, "second");
    const removed = await saveAndPublish(instance, "removed");

    const [one, two, gone] = [first, second, removed].map(String);

    storePage(instance, TOPIC, {
      builtFrom: "all",
      overview: `About the first [${one}]\nAbout both [${two}][${gone}]\nAbout the removed one [${gone}]`,
    });

    assert.deepEqual(await removeAndWrite(instance, removed), {
      state: "idle",
      failure: null,
      text: `About the first [${one}]\nAbout both [${two}]`,
      builtFrom: 2,
      items: 2,
    });
  });
});

describe("a removal that leaves no overview line sends the remaining Items to the model", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("counts them as not covered and keeps the Topic waiting for an overview", async () => {
    const cited = await saveAndPublish(instance, "cited");

    await saveAndPublish(instance, "other");
    storePage(instance, TOPIC, {
      builtFrom: "all",
      overview: `About the cited one [${String(cited)}]`,
    });
    await removeAndRewrite(instance, cited);

    const page = await until(
      "the overview is built from no Item",
      () => topicPage(instance),
      ({ overview }) => overview.builtFrom === 0,
    );

    assert.deepEqual(summary(page), {
      state: "pending",
      failure: null,
      text: null,
      builtFrom: 0,
      items: 1,
    });
  });
});

describe("Try again while a run is open for another Item of the Topic", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers 202, opens no second run and clears the failure marker", async () => {
    const open = await saveAndPublish(instance, "open");

    await saveAndPublish(instance, "other");
    await saveProvider(instance);
    storePage(instance, TOPIC, { builtFrom: [open], failure: "gave-up" });
    queueOverview(instance, open);

    const jobs = overviewJobs(instance);

    assert.equal((await instance.send("POST", `${TOPIC_PATH}/overview`)).status, 202);
    assert.deepEqual(overviewJobs(instance), jobs);
    assert.equal(jobs.length, 1);
    assert.equal(failureOf(instance, TOPIC), null);
  });
});
