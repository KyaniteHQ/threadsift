import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ErrorResponseSchema } from "../src/core/contract/error-wire.ts";
import {
  ItemDetailResponseSchema,
  ItemReadResponseSchema,
} from "../src/core/contract/item-route-wire.ts";
import { Instance } from "./instance.ts";
import {
  type Agents,
  callBoth,
  connectBoth,
  createAgentToken,
  restJson,
  sameAsRest,
} from "./mcp-client.ts";
import { KEPT_ARTICLE, type Library, NOTE_BODY, NOTE_WORD, seedLibrary } from "./mcp-fixtures.ts";
import { exec } from "./sqlite-fixtures.ts";

const MISSING_ID = 999_999;

const PAGE_SIZE = 50;

describe("an agent searches and reads Items through /mcp with the same answers as the HTTP API", () => {
  let instance: Instance;
  let agents: Agents;
  let library: Library;

  const sameSearch = (query: string, args: Record<string, string>) =>
    sameAsRest(instance, agents, `/api/items${query}`, "search", args);

  const sameRead = async (id: number) =>
    ItemDetailResponseSchema.parse(
      await sameAsRest(instance, agents, `/api/items/${String(id)}`, "read", { id }),
    ).item;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    agents = await connectBoth(instance, await createAgentToken(instance, "mcp tools"));
    library = await seedLibrary(instance);
    exec(
      instance,
      "insert into related_items (item_id, related_id, position, reason) values (?, ?, 1, 'Shared reference'), (?, ?, 0, 'Same subject')",
      library.keptId,
      library.lostId,
      library.keptId,
      library.threadId,
    );
  });

  after(async () => {
    await agents.legacy.close();
    await agents.modern.close();
    await instance.close();
  });

  it("lists exactly search, read and add, with their input schemas, output schemas and read-only hints", async () => {
    await Promise.all(
      [agents.legacy, agents.modern].map(async (client) => {
        const { tools } = await client.listTools();
        const [search, read, add] = tools;

        assert.deepEqual(
          tools.map(({ name }) => name),
          ["search", "read", "add"],
        );
        assert.deepEqual(Object.keys(search?.inputSchema.properties ?? {}), [
          "q",
          "topic",
          "tag",
          "source",
          "read",
          "url",
          "cursor",
        ]);
        assert.deepEqual(read?.inputSchema.required, ["id"]);
        assert.deepEqual(add?.inputSchema.required, ["url"]);
        assert.deepEqual(Object.keys(add?.inputSchema.properties ?? {}), ["url", "digest"]);
        assert.deepEqual(
          tools.map(({ annotations }) => annotations?.readOnlyHint),
          [true, true, false],
        );
        assert.deepEqual(
          tools.map(({ outputSchema }) => outputSchema?.["type"]),
          ["object", "object", "object"],
        );
      }),
    );
  });

  it("serves one client the 2025 handshake and the other a per-request exchange", () => {
    assert.equal(agents.legacy.getServerVersion()?.name, "threadsift");
    assert.equal(agents.legacy.getDiscoverResult(), undefined);
    assert.notEqual(agents.modern.getDiscoverResult(), undefined);
  });

  it("answers search with the Items, counts and filters of GET /api/items", async () => {
    const everything = ItemReadResponseSchema.parse(await sameSearch("", {}));

    assert.notEqual(everything.counts, undefined);

    await sameSearch(`?q=${NOTE_WORD}`, { q: NOTE_WORD });
    await sameSearch("?source=reddit", { source: "reddit" });
    await sameSearch("?source=x&read=unread", { source: "x", read: "unread" });
    await sameSearch("?topic=databases&tag=SQLite", { topic: "databases", tag: "SQLite" });
    await sameSearch(`?url=${encodeURIComponent(KEPT_ARTICLE)}`, { url: KEPT_ARTICLE });

    const byNote = ItemReadResponseSchema.parse(
      await restJson(instance, `/api/items?q=${NOTE_WORD}`),
    );

    assert.deepEqual(
      byNote.items.map(({ id }) => id),
      [library.keptId],
    );
  });

  it("pages search with the cursor of GET /api/items and sends no counts on a later page", async () => {
    const first = ItemReadResponseSchema.parse(await sameSearch("", {}));

    assert.equal(first.items.length, PAGE_SIZE);
    assert.notEqual(first.next, null);

    const second = ItemReadResponseSchema.parse(
      await sameSearch(`?cursor=${String(first.next)}`, { cursor: first.next ?? "" }),
    );

    assert.equal(second.counts, undefined);
    assert.equal(second.next, null);
    assert.equal(first.items.length + second.items.length, library.fillerIds.length + 3);
  });

  it("refuses a malformed cursor, an unknown filter value and a bad link as the HTTP API does", async () => {
    await Promise.all(
      [{ cursor: "nope" }, { source: "fax" }, { url: "not a link" }].map(async (args) => {
        const refused = await instance.send(
          "GET",
          "/api/items?" + new URLSearchParams(Object.entries(args)).toString(),
        );
        assert.equal(refused.status, 400);
        const reason = ErrorResponseSchema.parse(JSON.parse(refused.body)).error;
        for (const answer of await callBoth(agents, "search", args)) {
          assert.equal(answer.isError, true);
          assert.equal(answer.content.length, 1);
          const [entry] = answer.content;
          assert.ok(entry?.type === "text" && entry.text.endsWith(`: ${reason}`));
        }
      }),
    );
  });

  it("refuses an id that is not a whole number with the reason the HTTP API gives", async () => {
    const refused = z
      .object({ error: z.string() })
      .parse(JSON.parse((await instance.send("GET", "/api/items/0")).body));

    const answers = await callBoth(agents, "read", { id: 0 });

    assert.deepEqual(
      answers.map(({ isError, content }) => [
        isError,
        JSON.stringify(content).includes(refused.error),
      ]),
      [
        [true, true],
        [true, true],
      ],
    );
  });

  it("reads an Item with its Digest, Highlights and Note as GET /api/items/:id does", async () => {
    const item = await sameRead(library.keptId);

    assert.equal(item.digest?.summary.startsWith("Use the online backup command"), true);
    assert.deepEqual(
      item.related.map(({ id }) => id),
      [library.threadId, library.lostId],
    );
    assert.equal(item.note.body, NOTE_BODY);
    assert.deepEqual(
      item.highlights.items.map(({ status }) => status),
      ["attached"],
    );
  });

  it("reads a Highlight that lost its place in a refreshed text as unattached", async () => {
    const item = await sameRead(library.lostId);

    assert.deepEqual(
      item.highlights.items.map(({ status }) => status),
      ["unattached"],
    );
  });

  it("reads a comment that holds a Highlight after a new Digest stopped keeping it", async () => {
    const item = await sameRead(library.threadId);

    assert.equal(item.comments.kept, 1);
    assert.deepEqual(
      item.comments.nodes.map(({ id }) => id),
      ["t1_c1", "t1_c2"],
    );
    assert.deepEqual(
      item.highlights.items.map(({ status }) => status),
      ["attached"],
    );
  });

  it("answers a missing Item with a tool error where the HTTP API answers 404", async () => {
    assert.equal((await instance.send("GET", `/api/items/${String(MISSING_ID)}`)).status, 404);

    const answers = await callBoth(agents, "read", { id: MISSING_ID });

    assert.deepEqual(
      answers.map(({ isError, content }) => [isError, content]),
      Array.from({ length: 2 }, () => [true, [{ type: "text", text: "Not found" }]]),
    );
  });
});
