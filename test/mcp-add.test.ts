import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import type { Client } from "@modelcontextprotocol/client";

import { UPDATING } from "../src/http/save-route.ts";
import {
  ErrorResponseSchema,
  ItemReadResponseSchema,
  SavedItemResponseSchema,
} from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import {
  type Agents,
  callBoth,
  connectAgent,
  connectBoth,
  createAgentToken,
  sameAsRest,
} from "./mcp-client.ts";
import { DIGEST } from "./mcp-fixtures.ts";

describe("an agent adds a link through /mcp as POST /api/items adds it", () => {
  let instance: Instance;
  let agents: Agents;

  const total = async (): Promise<number | undefined> =>
    (await instance.read("GET", "/api/items", ItemReadResponseSchema)).counts?.total;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    agents = await connectBoth(instance, await createAgentToken(instance, "mcp add"));
  });

  after(async () => {
    await agents.legacy.close();
    await agents.modern.close();
    await instance.close();
  });

  it("adds a Link-only X Item that reads back as the HTTP API reads it, and adds the same link once", async () => {
    const link = "https://x.com/someone/status/2000000001";
    const [first, second] = await callBoth(agents, "add", { url: link });

    assert.equal(first?.isError, false);

    const added = SavedItemResponseSchema.parse(first?.body);
    const again = SavedItemResponseSchema.parse(second?.body);

    assert.equal(added.item.source, "x");
    assert.equal(added.url, `/items/${String(added.item.id)}`);
    assert.equal(again.item.id, added.item.id);

    await instance.settledItem(added.item.id);
    await sameAsRest(instance, agents, `/api/items/${String(added.item.id)}`, "read", {
      id: added.item.id,
    });

    const viaHttp = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
      url: link,
    });

    assert.equal(viaHttp.item.id, added.item.id);
    assert.equal(viaHttp.url, added.url);
  });

  it("refuses a link on the Instance's own network with the text of the 400, and saves nothing", async () => {
    const totalBefore = await total();
    const refusal = await instance.send("POST", "/api/items", { url: "http://10.0.0.5/admin" });

    assert.equal(refusal.status, 400);

    const answers = await callBoth(agents, "add", { url: "http://10.0.0.5/admin" });

    assert.deepEqual(
      answers.map(({ isError, content }) => [isError, content]),
      Array.from({ length: 2 }, () => [
        true,
        [{ type: "text", text: ErrorResponseSchema.parse(JSON.parse(refusal.body)).error }],
      ]),
    );
    assert.equal(await total(), totalBefore);
  });

  it("refuses an invalid link and an invalid Digest as tool errors, and saves nothing", async () => {
    const totalBefore = await total();

    const answers = await Promise.all(
      [
        { url: "not a link" },
        { url: "ftp://example.com/file" },
        { url: "https://example.com/a", digest: { ...DIGEST, title: "" } },
      ].map((args) => callBoth(agents, "add", args)),
    );

    assert.deepEqual(
      answers.flat().map(({ isError }) => isError),
      Array.from({ length: 6 }, () => true),
    );
    assert.equal(await total(), totalBefore);
  });
});

describe("add keeps the refusal that POST /api/items gives while a release rewrites stored Items", () => {
  let instance: Instance;
  let client: Client;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    client = await connectAgent(instance, await createAgentToken(instance, "mcp updating"));
  });

  after(async () => {
    await client.close();
    await instance.close();
  });

  it("refuses add with the text of the 503 and still serves search", async () => {
    const database = new DatabaseSync(instance.databaseFile);

    database.exec("delete from data_steps");
    database
      .prepare("insert into data_step_lease (id, holder, expires_at) values (1, 'another run', ?)")
      .run(Date.now() + 600_000);
    database.close();

    const link = "https://x.com/someone/status/5000000001";

    assert.equal((await instance.send("POST", "/api/items", { url: link })).status, 503);

    const added = await client.callTool({ name: "add", arguments: { url: link } });

    assert.equal(added.isError, true);
    assert.deepEqual(added.content, [{ type: "text", text: UPDATING }]);
    assert.notEqual((await client.callTool({ name: "search", arguments: {} })).isError, true);
  });
});

describe("a failure inside a tool reaches the agent as a fixed Internal error with no detail", () => {
  let instance: Instance;
  let client: Client;

  beforeEach(async () => {
    instance = await Instance.start();
    await instance.setUp();
    client = await connectAgent(instance, await createAgentToken(instance, "mcp failure"));
  });

  afterEach(async () => {
    await client.close();
    await instance.close();
  });

  it("hides the cause of a database failure from read", async () => {
    const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
      url: "https://x.com/someone/status/4000000001",
    });

    await instance.settledItem(item.id);

    const database = new DatabaseSync(instance.databaseFile);

    database.exec("alter table notes rename to notes_hidden");
    database.close();

    const answer = await client.callTool({ name: "read", arguments: { id: item.id } });

    assert.equal(answer.isError, true);
    assert.deepEqual(answer.content, [{ type: "text", text: "Internal error" }]);
  });

  it("hides the validation message when a stored value breaks the output schema", async () => {
    const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
      url: "https://x.com/someone/status/4000000002",
    });

    await instance.settledItem(item.id);

    const database = new DatabaseSync(instance.databaseFile);

    database.prepare("update items set normalized_url = 'not a url' where id = ?").run(item.id);
    database.close();

    const answer = await client.callTool({ name: "read", arguments: { id: item.id } });

    assert.equal(answer.isError, true);
    assert.deepEqual(answer.content, [{ type: "text", text: "Internal error" }]);
  });
});
