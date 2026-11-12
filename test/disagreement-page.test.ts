import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import {
  disagreementRows,
  replaceDigest,
  jobsOf,
  proposeDisagreement,
  runWeek,
  seedDigested,
  seedTopics,
  sentOf,
  tasksOf,
} from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { readPage } from "./lost-highlight-fixtures.ts";
import { SECRET_KEY, exec, rows, saveProvider } from "./related-fixtures.ts";

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
    seedTopics(instance, { 1: "Reading", 2: "Other" });
    seedDigested(instance, [
      { id: 1, topic: 1, summary: LISTED.first.summary },
      { id: 2, topic: 1, summary: LISTED.second.summary },
      { id: 3, topic: 1 },
      { id: 4, topic: 2 },
    ]);
    exec(
      instance,
      "insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) values ('topic-merge', 1, 2, 'Same subject.', 'open', 1)",
    );
    proposeDisagreement(instance, [1, 2]);
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "disagreement-page",
    }));
  });

  after(() => instance.close());

  it("lists the row to the owner and to an agent token in the same shape, with both Summaries read live, and 401 signed out", async () => {
    const owner = await readPage(instance);
    const agent = await instance.sendWithToken(token, "GET", "/api/proposals");

    assert.deepEqual(
      owner.proposals.map(({ kind }) => kind),
      ["items-disagree", "topic-merge"],
    );
    assert.equal(agent.body, JSON.stringify(owner));
    assert.equal((await instance.fetch("/api/proposals")).status, 401);
    assert.deepEqual(JSON.parse(JSON.stringify(owner.proposals[0])), LISTED);

    exec(
      instance,
      "update digests set digest = replace(digest, 'on by default', 'enabled by default') where item_id = 1",
    );
    assert.match(JSON.stringify((await readPage(instance)).proposals[0]), /enabled by default/u);
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

  it("answers 409 not-supported on accept and leaves the row open, then rejects it once and answers 409 not-open the second time", async () => {
    const id = String(LISTED.id);
    const accepted = await instance.send("POST", `/api/proposals/${id}/accept`);

    assert.deepEqual(
      [accepted.status, JSON.parse(accepted.body)],
      [409, { error: "not-supported" }],
    );
    assert.deepEqual(
      disagreementRows(instance).map(({ state }) => state),
      ["open"],
    );

    const rejected = await instance.send("POST", `/api/proposals/${id}/reject`);
    const again = await instance.send("POST", `/api/proposals/${id}/reject`);

    assert.deepEqual([rejected.status, JSON.parse(rejected.body)], [200, { state: "rejected" }]);
    assert.deepEqual([again.status, JSON.parse(again.body)], [409, { error: "not-open" }]);
    assert.deepEqual(
      (await readPage(instance)).proposals.map(({ kind }) => kind),
      ["topic-merge"],
    );
  });

  it("describes the shape and the new code in the OpenAPI document", async () => {
    const document = z
      .object({ paths: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    assert.match(JSON.stringify(document.paths["/api/proposals"]), /items-disagree/u);
    assert.match(JSON.stringify(document.paths["/api/proposals/{id}/accept"]), /not-supported/u);
  });
});

describe("a disagreement row stays only while the pair was judged on the Digests that are stored", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Reading", 2: "Other" });
    seedDigested(instance, [
      ...Array.from({ length: 9 }, (_, at) => ({ id: at + 1, topic: 1 })),
      { id: 10, topic: 2 },
    ]);
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("hides at once, and deletes at the next weekly stage, an open row whose Digest changed or whose Items left one Topic, and keeps a rejected row", async () => {
    const changed = proposeDisagreement(instance, [1, 2]);
    const moved = proposeDisagreement(instance, [3, 4]);
    const rejected = proposeDisagreement(instance, [5, 6], "rejected");
    const kept = proposeDisagreement(instance, [7, 8]);

    replaceDigest(instance, 1, 900);
    exec(instance, "update items set topic_id = 2 where id = 4");
    replaceDigest(instance, 5, 901);

    assert.deepEqual(
      (await readPage(instance)).proposals.map(({ id }) => id),
      [kept],
    );
    assert.equal(disagreementRows(instance).length, 4);

    await runWeek(instance);

    assert.deepEqual(
      disagreementRows(instance).map(({ id }) => id),
      [rejected, kept],
    );
    assert.deepEqual(
      [changed, moved].filter((id) => disagreementRows(instance).some((row) => row.id === id)),
      [],
    );
  });

  it("sends a decided pair as decided, rejected or not, and never stores the pair a second time in the other order", () => {
    const [sent] = sentOf(instance);

    assert.equal(
      sent?.decided.some(([low, high]) => low === 5 && high === 6),
      true,
    );
    assert.throws(() => {
      exec(
        instance,
        "insert into proposals (kind, from_item_id, into_item_id, from_digest, into_digest, reason, state, created_at) values ('items-disagree', 6, 5, 6, 901, 'Again.', 'open', 1)",
      );
    }, /UNIQUE/u);
  });
});

describe("deleting an Item that a disagreement row names", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Reading" });
    seedDigested(instance, [
      { id: 1, topic: 1 },
      { id: 2, topic: 1 },
      { id: 3, topic: 1 },
      { id: 4, topic: 1 },
      { id: 5, topic: 1 },
    ]);
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
