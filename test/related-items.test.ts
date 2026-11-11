import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ItemDetailResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import { type Agents, connectBoth, createAgentToken, sameAsRest } from "./mcp-client.ts";
import { SECRET_KEY, exec, pairsOf, paste, rows } from "./related-fixtures.ts";

const COUNT_SCHEMA = z.object({ count: z.number() });

function seed(
  instance: Instance,
  source: number,
  related: number,
  position: number,
  reason: string,
): void {
  exec(
    instance,
    "insert into related_items (item_id, related_id, position, reason) values (?, ?, ?, ?)",
    source,
    related,
    position,
    reason,
  );
}

function refused(instance: Instance, query: string, ...params: readonly (string | number)[]): void {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    database.exec("PRAGMA foreign_keys = ON");

    assert.throws(() => database.prepare(query).run(...params));
  } finally {
    database.close();
  }
}

function count(instance: Instance): number {
  return rows(instance, COUNT_SCHEMA, "select count(*) as count from related_items")[0]?.count ?? 0;
}

describe("an Item's Related Items are read through the API and the MCP read tool and leave with either Item", () => {
  let instance: Instance;
  let agents: Agents;
  let source: number;
  let first: number;
  let digestless: number;
  let gap: number;
  let last: number;
  let alone: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    agents = await connectBoth(instance, await createAgentToken(instance, "related"));
    source = await paste(instance, "source", { title: "The source" });
    first = await paste(instance, "first", { title: "First Digest title" });
    digestless = await paste(instance, "digestless", {
      title: "-",
      pageTitle: "Fetched title",
      noDigest: true,
    });
    gap = await paste(instance, "gap", { title: "Third Digest title" });
    last = await paste(instance, "last", { title: "Last Digest title" });
    alone = await paste(instance, "alone", { title: "Alone" });
    seed(instance, source, last, 4, "Reason of the last");
    seed(instance, source, first, 0, "Reason of the first");
    seed(instance, source, gap, 2, "Reason of the third");
    seed(instance, source, digestless, 1, "Reason of the second");
  });

  after(async () => {
    await agents.legacy.close();
    await agents.modern.close();
    await instance.close();
  });

  const readRelated = async (id: number) => (await instance.detail(id)).related;

  it("answers up to 5 entries in position order, with the Digest title or else the fetched title", async () => {
    assert.deepEqual(
      (await readRelated(source)).map(({ id, title, source: from, reason }) => [
        id,
        title,
        from,
        reason,
      ]),
      [
        [first, "First Digest title", "article", "Reason of the first"],
        [digestless, "Fetched title", "article", "Reason of the second"],
        [gap, "Third Digest title", "article", "Reason of the third"],
        [last, "Last Digest title", "article", "Reason of the last"],
      ],
    );
  });

  it("answers an empty list for an Item with none, and does not list the pick in the other Item's Reader", async () => {
    assert.deepEqual(await readRelated(alone), []);
    assert.deepEqual(await readRelated(first), []);
  });

  it("gives the MCP read tool the same answer as the HTTP route", async () => {
    const { item } = ItemDetailResponseSchema.parse(
      await sameAsRest(instance, agents, `/api/items/${String(source)}`, "read", { id: source }),
    );

    assert.deepEqual(
      item.related.map(({ id }) => id),
      [first, digestless, gap, last],
    );
  });

  it("removes a pair when either Item is deleted, and renumbers nothing", async () => {
    assert.equal((await instance.send("DELETE", `/api/items/${String(gap)}`)).status, 204);
    assert.deepEqual(
      (await readRelated(source)).map(({ id }) => id),
      [first, digestless, last],
    );
    assert.deepEqual(
      pairsOf(instance, source).map(({ position }) => position),
      [0, 1, 4],
    );
    assert.equal((await instance.send("DELETE", `/api/items/${String(source)}`)).status, 204);
    assert.equal(count(instance), 0);
  });
});

describe("the related_items table refuses a row that contradicts itself", () => {
  let instance: Instance;
  let a: number;
  let b: number;
  let c: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    a = await paste(instance, "a", { title: "A" });
    b = await paste(instance, "b", { title: "B" });
    c = await paste(instance, "c", { title: "C" });
    seed(instance, a, b, 0, "A reason");
  });

  after(() => instance.close());

  const insert =
    "insert into related_items (item_id, related_id, position, reason) values (?, ?, ?, ?)";

  it("refuses a repeated pair, an Item paired with itself and a duplicate position", () => {
    refused(instance, insert, a, b, 1, "Again");
    refused(instance, insert, a, a, 1, "Itself");
    refused(instance, insert, a, c, 0, "Same position");
  });

  it("refuses a position outside 0 to 4, an empty reason and an unknown Item", () => {
    refused(instance, insert, a, c, 5, "Too far");
    refused(instance, insert, a, c, -1, "Too early");
    refused(instance, insert, a, c, 1, "");
    refused(instance, insert, a, 9999, 1, "Unknown");
  });
});
