import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { BatchResponseSchema } from "../src/http/batch-schemas.ts";
import { ErrorResponseSchema } from "../src/http/schemas.ts";
import { Instance, type Json } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";

const ImportStateSchema = z.object({ name: z.string(), cursor: z.string(), updatedAt: z.number() });

const xLink = (id: number): string => `https://x.com/someone/status/${String(id)}`;

const links = (total: number) =>
  Array.from({ length: total }, (_, index) => ({ url: xLink(3100000000 + index) }));

describe("a routine saves many links in one call and keeps a cursor on the Instance", () => {
  let instance: Instance;
  let agent: string;

  const batch = (body: Json, headers: Readonly<Record<string, string>> = {}) =>
    instance.send("POST", "/api/items/batch", body, headers);

  const count = (table: "items" | "jobs"): number => {
    const database = new DatabaseSync(instance.databaseFile, { readOnly: true });

    try {
      const row = database.prepare(`select count(*) as total from ${table}`).get();

      return z.object({ total: z.number() }).parse(row).total;
    } finally {
      database.close();
    }
  };

  const importOf = async (name: string) => {
    const answer = await instance.send("GET", `/api/imports/${name}`);

    return {
      status: answer.status,
      state: answer.status === 200 ? ImportStateSchema.parse(JSON.parse(answer.body)) : null,
    };
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    agent = (await createAgentToken(instance, "routine")).value;
  });

  after(() => instance.close());

  it("answers each link in order, then answers known for the repeat of the same call without opening a job", async () => {
    const body = {
      links: [
        { url: xLink(3000000001) },
        { url: "http://localhost/private" },
        { url: xLink(3000000002) },
      ],
      import: { name: "x-bookmarks", cursor: "3000000002" },
    };

    const first = BatchResponseSchema.parse(JSON.parse((await batch(body)).body));

    assert.deepEqual(
      first.results.map((result) => result.outcome),
      ["added", "refused", "added"],
    );
    assert.deepEqual(first.results[1], { url: "http://localhost/private", outcome: "refused" });
    assert.deepEqual(first.import, body.import);

    const jobsBefore = count("jobs");
    const itemsBefore = count("items");
    const again = BatchResponseSchema.parse(JSON.parse((await batch(body)).body));

    assert.deepEqual(
      again.results.map((result) => result.outcome),
      ["known", "refused", "known"],
    );
    assert.deepEqual(
      again.results.map((result) => ("item" in result ? result.item.id : null)),
      first.results.map((result) => ("item" in result ? result.item.id : null)),
    );
    assert.equal(count("jobs"), jobsBefore);
    assert.equal(count("items"), itemsBefore);
  });

  it("saves the cursor after the last link and reads it back, and a call without import leaves it alone", async () => {
    const saved = await importOf("x-bookmarks");

    assert.equal(saved.state?.cursor, "3000000002");

    await batch({ links: [{ url: xLink(3000000003) }] });

    assert.deepEqual(await importOf("x-bookmarks"), saved);
    assert.equal((await importOf("never-called")).status, 404);
  });

  it("keeps a second cursor under another name independent, and moves a cursor on the next call", async () => {
    await batch({
      links: [{ url: xLink(3000000004) }],
      import: { name: "reddit.saved_2", cursor: "t3_abc" },
    });
    await batch({
      links: [{ url: xLink(3000000005) }],
      import: { name: "x-bookmarks", cursor: "3000000005" },
    });

    assert.equal((await importOf("reddit.saved_2")).state?.cursor, "t3_abc");
    assert.equal((await importOf("x-bookmarks")).state?.cursor, "3000000005");
  });

  it("answers 400 with the entry's index and saves nothing, moving no cursor, when one entry is invalid", async () => {
    const itemsBefore = count("items");

    const bad = [
      { url: "not a link" },
      { url: xLink(3000000006), content: ["{}"] },
      { url: xLink(3000000006), fill: true },
    ];

    const answers = await Promise.all(
      bad.map((entry) =>
        batch({
          links: [{ url: xLink(3000000007) }, entry],
          import: { name: "x-bookmarks", cursor: "late" },
        }),
      ),
    );

    for (const answer of answers) {
      assert.equal(answer.status, 400);
      assert.match(ErrorResponseSchema.parse(JSON.parse(answer.body)).error, /^links\.1/u);
    }

    assert.equal(count("items"), itemsBefore);
    assert.equal((await importOf("x-bookmarks")).state?.cursor, "3000000005");
  });

  it("answers 400 for 0 links, 101 links and a malformed import, and saves nothing", async () => {
    const itemsBefore = count("items");

    const refused = [
      await batch({ links: [] }),
      await batch({ links: links(101) }),
      await batch({ links: links(1), import: { name: "bad name", cursor: "1" } }),
      await batch({ links: links(1), import: { name: "ok", cursor: "" } }),
      await batch({ links: links(1), import: { name: "ok", cursor: "x".repeat(257) } }),
    ];

    assert.deepEqual(
      refused.map((answer) => answer.status),
      [400, 400, 400, 400, 400],
    );
    assert.equal(count("items"), itemsBefore);
  });

  it("saves 100 links in one call", async () => {
    const answer = await batch({
      links: Array.from({ length: 100 }, (_, index) => ({ url: xLink(3200000000 + index) })),
    });

    assert.equal(answer.status, 200);

    const { results } = BatchResponseSchema.parse(JSON.parse(answer.body));

    assert.equal(results.length, 100);
    assert.ok(results.every((result) => result.outcome === "added"));
  });

  it("works with an agent token and answers 401 with no credentials", async () => {
    const withToken = await instance.fetch("/api/items/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${agent}`, "content-type": "application/json" },
      body: JSON.stringify({
        links: [{ url: xLink(3300000001) }],
        import: { name: "agent-routine", cursor: "7" },
      }),
    });

    assert.equal(withToken.status, 200);

    const read = await instance.fetch("/api/imports/agent-routine", {
      headers: { authorization: `Bearer ${agent}` },
    });

    assert.equal(read.status, 200);
    assert.equal(ImportStateSchema.parse(await read.json()).cursor, "7");

    const anonymous = await instance.fetch("/api/items/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ links: [{ url: xLink(3300000002) }] }),
    });

    assert.equal(anonymous.status, 401);
    assert.equal((await instance.fetch("/api/imports/agent-routine")).status, 401);
  });
});
