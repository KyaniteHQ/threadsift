import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { UnavailableResponseSchema } from "../src/core/contract/error-wire.ts";
import { RedditSettingsSchema } from "../src/core/contract/reddit-contract.ts";
import { propose } from "./accept-fixtures.ts";
import { botInstance, selectGrokBot } from "./bot-task-fixtures.ts";
import { proposeDisagreement } from "./disagreement-fixtures.ts";
import { type Answer, Instance } from "./instance.ts";
import { paste } from "./library-fixtures.ts";
import { holdLibrary, releaseLibrary } from "./restore-fixtures.ts";

describe("an owner write that adds a record the zip may hold is refused while a Restore holds the library", () => {
  let instance: Instance;
  let one: number;
  let two: number;
  let proposals: readonly number[];

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    one = await paste(instance, "one", {
      title: "One",
      topic: "Reading",
      tags: ["ml", "machine learning"],
    });
    two = await paste(instance, "two", { title: "Two", topic: "Reading", tags: ["ml"] });
    proposals = [
      propose(instance, ["ml", "machine learning"]),
      proposeDisagreement(instance, [one, two]),
    ];
  });

  after(() => instance.close());

  const records = () =>
    ["highlights", "notes", "pins", "ai_tasks", "log_entries"].map((table) =>
      instance.database.rowCount(table),
    );
  const archiveFill = async () =>
    (await instance.read("GET", "/api/settings/reddit", RedditSettingsSchema)).archiveFill;

  async function ownerWrites(): Promise<readonly (readonly [string, Answer])[]> {
    const reader = await instance.detail(one);
    const text = reader.postText ?? "";
    const doors: readonly (readonly [string, () => Promise<Answer>])[] = [
      [
        "keep a Highlight",
        () =>
          instance.send("POST", `/api/items/${String(one)}/highlights`, {
            target: { kind: "post" },
            revision: reader.highlights.revisions.post,
            selector: { exact: text.slice(0, 20), prefix: "", suffix: text.slice(20, 52), hint: 0 },
          }),
      ],
      [
        "save a Note",
        () =>
          instance.send("PUT", `/api/items/${String(one)}/note`, {
            body: "typed",
            revision: reader.note.revision,
          }),
      ],
      ["ask for a Digest", () => instance.send("POST", `/api/items/${String(two)}/digest`)],
      ["ask for a Topic overview", () => instance.send("POST", "/api/topics/reading/overview")],
      ...proposals.map(
        (id) =>
          [
            `accept Proposal ${String(id)}`,
            () => instance.send("POST", `/api/proposals/${String(id)}/accept`),
          ] as const,
      ),
      [
        "save the Reddit setting",
        () => instance.send("PUT", "/api/settings/reddit", { archiveFill: false }),
      ],
    ];
    const answers: (readonly [string, Answer])[] = [];

    for (const [door, send] of doors) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each door answers on its own, in the order listed.
      answers.push([door, await send()]);
    }

    return answers;
  }

  it("answers 503 restoring and adds no record through each door, and takes each write once the run no longer holds", async () => {
    const stored = records();
    const fill = await archiveFill();

    holdLibrary(instance, "running", null);

    for (const [door, answer] of await ownerWrites()) {
      assert.equal(answer.status, 503, door);
      assert.equal(
        UnavailableResponseSchema.parse(JSON.parse(answer.body)).code,
        "restoring",
        door,
      );
    }

    assert.deepEqual(records(), stored);
    assert.equal(await archiveFill(), fill);

    releaseLibrary(instance);

    for (const [door, answer] of await ownerWrites()) {
      assert.notEqual(answer.status, 503, door);
    }

    const [highlights, notes] = records();

    assert.deepEqual([highlights, notes], [(stored[0] ?? 0) + 1, (stored[1] ?? 0) + 1]);
    assert.equal(await archiveFill(), false);
  });
});

describe("a Provider Verify starts no AI task while a Restore holds the library", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();
    await selectGrokBot(instance);
  });

  after(() => instance.close());

  it("answers 503 restoring with the Grok Bot as the Provider and adds no AI task", async () => {
    holdLibrary(instance, "running", null);

    const answer = await instance.send("POST", "/api/settings/ai/verify");

    assert.equal(answer.status, 503);
    assert.equal(UnavailableResponseSchema.parse(JSON.parse(answer.body)).code, "restoring");
    assert.equal(instance.database.rowCount("ai_tasks"), 0);
  });
});
