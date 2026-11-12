import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import {
  disagreementRows,
  jobsOf,
  pasteItems,
  proposeDisagreement,
  replaceDigest,
  runWeek,
  sentOf,
  tasksOf,
  topicIdOf,
} from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { readPage } from "./lost-highlight-fixtures.ts";
import { SECRET_KEY, exec, rows, saveProvider } from "./related-fixtures.ts";

const listedIds = async (instance: Instance): Promise<readonly number[]> =>
  (await readPage(instance)).proposals.flatMap(({ id, kind }) =>
    kind === "items-disagree" ? [id] : [],
  );

const LISTED = {
  id: 2,
  kind: "items-disagree",
  state: "open",
  reason: "They give opposite advice.",
  topic: { key: "reading", name: "Reading" },
  first: { id: 1, title: "Title 1", summary: "The setting is on by default." },
  second: { id: 2, title: "Title 2", summary: "The setting is off by default." },
};

describe("disagreement rows beside the other kinds", () => {
  let instance: Instance;
  let token: string;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteItems(instance, [
      { topic: "Reading", title: LISTED.first.title, summary: LISTED.first.summary },
      { topic: "Reading", title: LISTED.second.title, summary: LISTED.second.summary },
      { topic: "Reading" },
      { topic: "Other" },
    ]);
    exec(
      instance,
      "insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) values ('topic-merge', ?, ?, 'Same subject.', 'open', 1)",
      topicIdOf(instance, "Reading"),
      topicIdOf(instance, "Other"),
    );
    proposeDisagreement(instance, [1, 2]);
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "disagreement-page",
    }));
  });

  after(() => instance.close());

  it("lists the row to the owner and to an agent token in the same shape, with both stored Summaries, and 401 signed out", async () => {
    const owner = await readPage(instance);
    const agent = await instance.sendWithToken(token, "GET", "/api/proposals");

    assert.deepEqual(
      owner.proposals.map(({ kind }) => kind),
      ["items-disagree", "topic-merge"],
    );
    assert.equal(agent.body, JSON.stringify(owner));
    assert.equal((await instance.fetch("/api/proposals")).status, 401);
    assert.deepEqual(JSON.parse(JSON.stringify(owner.proposals[0])), LISTED);
  });

  it("refuses an agent token on accept and reject and a signed-out call, answers 404 for an unknown id", async () => {
    const id = String(LISTED.id);

    assert.equal(
      (await instance.sendWithToken(token, "POST", `/api/proposals/${id}/reject`)).status,
      403,
    );
    assert.equal(
      (await instance.sendWithToken(token, "POST", `/api/proposals/${id}/accept`)).status,
      403,
    );
    assert.equal(
      (await instance.fetch(`/api/proposals/${id}/reject`, { method: "POST" })).status,
      401,
    );
    assert.equal((await instance.send("POST", "/api/proposals/999/reject")).status, 404);
    assert.equal((await instance.send("POST", "/api/proposals/999/accept")).status, 404);
  });

  it("rejects the row once, answers 409 not-open the second time and on accept, and lists it no more", async () => {
    const id = String(LISTED.id);
    const rejected = await instance.send("POST", `/api/proposals/${id}/reject`);
    const again = await instance.send("POST", `/api/proposals/${id}/reject`);
    const accepted = await instance.send("POST", `/api/proposals/${id}/accept`);

    assert.deepEqual([rejected.status, JSON.parse(rejected.body)], [200, { state: "rejected" }]);
    assert.deepEqual([again.status, JSON.parse(again.body)], [409, { error: "not-open" }]);
    assert.deepEqual([accepted.status, JSON.parse(accepted.body)], [409, { error: "not-open" }]);
    assert.deepEqual(
      (await readPage(instance)).proposals.map(({ kind }) => kind),
      ["topic-merge"],
    );
  });

  it("describes the shape and the Accept answer in the OpenAPI document", async () => {
    const document = z
      .object({ paths: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    assert.match(JSON.stringify(document.paths["/api/proposals"]), /items-disagree/u);
    assert.match(JSON.stringify(document.paths["/api/proposals/{id}/accept"]), /items-disagree/u);
  });
});

describe("a disagreement row stays only while the pair was judged on the Digests that are stored", () => {
  let instance: Instance;
  let changed = 0;
  let moved = 0;
  let rejected = 0;
  let kept = 0;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteItems(instance, [
      ...Array.from({ length: 9 }, () => ({ topic: "Reading" })),
      { topic: "Other" },
    ]);
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("hides at once, and deletes at the next weekly stage, an open row whose Digest changed, and keeps a rejected row", async () => {
    changed = proposeDisagreement(instance, [1, 2]);
    rejected = proposeDisagreement(instance, [5, 6], "rejected");
    kept = proposeDisagreement(instance, [7, 8]);

    await replaceDigest(instance, 1, { topic: "Reading", summary: "A new summary of the first." });
    await replaceDigest(instance, 5, { topic: "Reading", summary: "A new summary of the fifth." });

    assert.deepEqual(await listedIds(instance), [kept]);
    assert.equal(disagreementRows(instance).length, 3);

    await runWeek(instance);

    assert.deepEqual(
      disagreementRows(instance).map(({ id }) => id),
      [rejected, kept],
    );
    assert.equal(
      disagreementRows(instance).some(({ id }) => id === changed),
      false,
    );
  });

  it("hides an open row whose Items sit in two Topics, keeps it through the next weekly stage, and lists it again when the Items are back in one Topic", async () => {
    moved = proposeDisagreement(instance, [3, 4]);
    exec(instance, "update items set topic_id = ? where id = 4", topicIdOf(instance, "Other"));

    assert.deepEqual(await listedIds(instance), [kept]);

    await runWeek(instance);

    assert.equal(
      disagreementRows(instance).some(({ id }) => id === moved),
      true,
    );

    exec(instance, "update items set topic_id = ? where id = 4", topicIdOf(instance, "Reading"));

    assert.deepEqual(await listedIds(instance), [moved, kept]);
  });

  it("sends a decided pair as decided, rejected or not", () => {
    const [sent] = sentOf(instance);

    assert.equal(
      sent?.decided.some(([low, high]) => low === 5 && high === 6),
      true,
    );
  });
});

describe("deleting an Item that a disagreement row names", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteItems(
      instance,
      Array.from({ length: 5 }, () => ({ topic: "Reading" })),
    );
    proposeDisagreement(instance, [1, 2]);
    proposeDisagreement(instance, [2, 3]);
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("removes the rows that name either Item and leaves the other rows", async () => {
    assert.equal((await instance.send("DELETE", "/api/items/1")).status, 204);
    assert.deepEqual(
      disagreementRows(instance).map(({ from_item_id: from, into_item_id: into }) => [from, into]),
      [[2, 3]],
    );
    assert.equal((await instance.send("DELETE", "/api/items/3")).status, 204);
    assert.deepEqual(disagreementRows(instance), []);
  });

  it("removes the open job and the AI task of the weekly run when the Item that owns them is deleted", async () => {
    await runWeek(instance);
    assert.deepEqual([jobsOf(instance).length, tasksOf(instance).length], [1, 1]);
    assert.equal(tasksOf(instance)[0]?.item_id, 5);
    assert.equal((await instance.send("DELETE", "/api/items/5")).status, 204);
    assert.deepEqual([jobsOf(instance).length, tasksOf(instance).length], [0, 0]);
    assert.deepEqual(
      rows(
        instance,
        z.object({ n: z.number() }),
        "select count(*) as n from proposals where kind = 'items-disagree'",
      ),
      [{ n: 0 }],
    );
  });
});
