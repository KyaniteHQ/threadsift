import assert from "node:assert/strict";

import { z } from "zod";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import type { Instance, Json } from "./instance.ts";
import { rows } from "./related-fixtures.ts";

const ErrorSchema = z.object({ error: z.string() });

const CountSchema = z.object({ n: z.number() });

export const DIGEST = {
  title: "Backing up SQLite while it is written",
  topic: "Databases",
  tags: ["sqlite", "backups"],
  summary: "Use the online backup command.\nCheck the copy opens before trusting it.",
  keyPoints: ["A plain copy can tear a page"],
};

export function xClient(instance: Instance) {
  const count = (table: string): number =>
    rows(instance, CountSchema, `select count(*) as n from ${table}`)[0]?.n ?? -1;

  const saved = async (body: Json) => {
    const answer = await instance.send("POST", "/api/items", body);

    assert.ok([200, 201].includes(answer.status), answer.body);

    return SavedItemResponseSchema.parse(JSON.parse(answer.body)).item;
  };

  const refused = async (body: Json): Promise<string> => {
    const before = [count("items"), count("reddit_comments"), count("reddit_threads")];
    const answer = await instance.send("POST", "/api/items", body);

    assert.equal(answer.status, 400, answer.body);
    assert.deepEqual([count("items"), count("reddit_comments"), count("reddit_threads")], before);

    return ErrorSchema.parse(JSON.parse(answer.body)).error;
  };

  const itemIdOf = (statusId: string): number => {
    const [found] = rows(
      instance,
      z.object({ id: z.number() }),
      "select id from items where normalized_url = ?",
      `https://x.com/i/status/${statusId}`,
    );

    assert.ok(found !== undefined);

    return found.id;
  };

  const generationOf = (itemId: number): number | undefined =>
    rows(
      instance,
      z.object({ generation: z.number() }),
      "select generation from items where id = ?",
      itemId,
    )[0]?.generation;

  return { count, saved, refused, itemIdOf, generationOf };
}
