import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import { exec, paste, rows } from "./related-fixtures.ts";

const TagSchema = z.object({ id: z.number(), name: z.string() });

const StateSchema = z.object({ state: z.string() });

function tagIds(instance: Instance): ReadonlyMap<string, number> {
  return new Map(
    rows(instance, TagSchema, "select id, name from tags").map(({ id, name }) => [name, id]),
  );
}

function seedProposal(
  instance: Instance,
  [from, into]: readonly [number, number],
  state: string,
  reason: string | null,
): void {
  exec(
    instance,
    "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values ('tag-merge', ?, ?, ?, ?, 1)",
    from,
    into,
    reason,
    state,
  );
}

const states = (instance: Instance) =>
  rows(instance, StateSchema, "select state from proposals order by id").map(({ state }) => state);

describe("the Proposals routes", () => {
  let instance: Instance;
  let token: string;
  let ids: ReadonlyMap<string, number>;

  const id = (name: string): number => {
    const found = ids.get(name);

    assert.ok(found !== undefined, name);

    return found;
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "one", { title: "One", tags: ["machine learning", "ml", "llm"] });
    await paste(instance, "two", { title: "Two", tags: ["machine learning", "llm", "llms"] });
    ids = tagIds(instance);
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "proposals",
    }));
  });

  after(() => instance.close());

  it("answers an empty list to the owner and an agent token, and 401 signed out", async () => {
    const owner = await instance.read("GET", "/api/proposals", ProposalPageSchema);
    const agent = await instance.sendWithToken(token, "GET", "/api/proposals");
    const signedOut = await instance.fetch("/api/proposals");

    assert.deepEqual(owner, { proposals: [], checkedAt: null, provider: false, next: null });
    assert.deepEqual([agent.status, signedOut.status], [200, 401]);
    assert.equal(agent.body, JSON.stringify(owner));
  });

  it("lists open rows newest first with live Item counts and none that are decided", async () => {
    seedProposal(instance, [id("ml"), id("machine learning")], "open", "Short form of the name.");
    seedProposal(instance, [id("llms"), id("llm")], "open", "Plural of the same word.");
    seedProposal(instance, [id("llm"), id("ml")], "declined", null);
    seedProposal(instance, [id("llms"), id("ml")], "rejected", "Not the same.");

    const page = await instance.read("GET", "/api/proposals", ProposalPageSchema);

    assert.deepEqual(
      page.proposals.map(({ from, into, reason, state, kind }) => ({
        from: `${from.name}:${String(from.items)}`,
        into: `${into.name}:${String(into.items)}`,
        reason,
        state,
        kind,
      })),
      [
        {
          from: "llms:1",
          into: "llm:2",
          reason: "Plural of the same word.",
          state: "open",
          kind: "tag-merge",
        },
        {
          from: "ml:1",
          into: "machine learning:2",
          reason: "Short form of the name.",
          state: "open",
          kind: "tag-merge",
        },
      ],
    );
  });

  it("pages by the last id and refuses a malformed cursor", async () => {
    const first = await instance.read("GET", "/api/proposals", ProposalPageSchema);
    const [newest] = first.proposals;

    assert.ok(newest !== undefined);

    const second = await instance.read(
      "GET",
      `/api/proposals?cursor=${String(newest.id)}`,
      ProposalPageSchema,
    );

    assert.equal(second.proposals.length, first.proposals.length - 1);

    const answers = await Promise.all(
      ["", "x", "-1", "1.5", "12345678901234567", "9007199254740993"].map(async (cursor) => ({
        cursor,
        status: (await instance.send("GET", `/api/proposals?cursor=${cursor}`)).status,
      })),
    );

    assert.deepEqual(
      answers.filter(({ status }) => status !== 400),
      [],
    );
  });

  it("refuses a token and a signed-out call a Reject, and reports an unknown id", async () => {
    const [newest] = (await instance.read("GET", "/api/proposals", ProposalPageSchema)).proposals;

    assert.ok(newest !== undefined);

    const path = `/api/proposals/${String(newest.id)}/reject`;
    const agent = await instance.sendWithToken(token, "POST", path);
    const signedOut = await instance.fetch(path, { method: "POST" });

    assert.deepEqual([agent.status, signedOut.status], [403, 401]);
    assert.equal((await instance.send("POST", "/api/proposals/999999/reject")).status, 404);
    assert.deepEqual(states(instance), ["open", "open", "declined", "rejected"]);
  });

  it("moves an open row to rejected once, answers 409 not-open after, and lists it no more", async () => {
    const [newest] = (await instance.read("GET", "/api/proposals", ProposalPageSchema)).proposals;

    assert.ok(newest !== undefined);

    const path = `/api/proposals/${String(newest.id)}/reject`;
    const first = await instance.send("POST", path);
    const second = await instance.send("POST", path);

    assert.deepEqual([first.status, first.body], [200, JSON.stringify({ state: "rejected" })]);
    assert.deepEqual([second.status, second.body], [409, JSON.stringify({ error: "not-open" })]);
    assert.deepEqual(states(instance), ["open", "rejected", "declined", "rejected"]);

    const page = await instance.read("GET", "/api/proposals", ProposalPageSchema);

    assert.equal(page.proposals.length, 1);
    assert.equal((await instance.send("POST", "/api/proposals/abc/reject")).status, 400);
  });

  it("describes both routes in the OpenAPI document", async () => {
    const document = z
      .object({ paths: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    assert.deepEqual(
      ["/api/proposals", "/api/proposals/{id}/reject"].map((path) => path in document.paths),
      [true, true],
    );
  });

  it("leaves rows alone when an Item is deleted, with the counts shrinking live", async () => {
    const unchanged = states(instance);
    const [only] = (await instance.read("GET", "/api/proposals", ProposalPageSchema)).proposals;

    assert.ok(only !== undefined);

    const items = rows(
      instance,
      z.object({ id: z.number() }),
      "select item_id as id from item_tags where tag_id = ? order by item_id",
      only.into.id,
    );

    const [gone] = items;

    assert.ok(gone !== undefined);
    assert.equal((await instance.send("DELETE", `/api/items/${String(gone.id)}`)).status, 204);
    assert.deepEqual(states(instance), unchanged);

    const shrunk = (await instance.read("GET", "/api/proposals", ProposalPageSchema)).proposals[0];

    assert.equal(shrunk?.into.items, only.into.items - 1);
  });
});

describe("the Proposals list is paged at 50 rows", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    exec(
      instance,
      "with recursive n(i) as (select 1 union all select i + 1 from n where i < 102) insert into tags (key, name) select 'p' || i, 'P' || i from n",
    );
    exec(
      instance,
      "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) select 'tag-merge', id, id + 1, 'The same concept.', 'open', id from tags where id % 2 = 1",
    );
  });

  after(() => instance.close());

  it("sends 50 rows and the id of the last one, then the row left and no cursor", async () => {
    const first = await instance.read("GET", "/api/proposals", ProposalPageSchema);
    const last = first.proposals.at(-1);

    assert.equal(first.proposals.length, 50);
    assert.equal(first.next, String(last?.id));

    const second = await instance.read(
      "GET",
      `/api/proposals?cursor=${first.next ?? ""}`,
      ProposalPageSchema,
    );

    assert.deepEqual([second.proposals.length, second.next], [1, null]);
    assert.deepEqual(
      [...first.proposals, ...second.proposals].map(({ id }) => id),
      Array.from({ length: 51 }, (_, at) => 51 - at),
    );
  });
});
