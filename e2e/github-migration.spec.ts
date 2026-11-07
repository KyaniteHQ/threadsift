import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { ItemDetailResponseSchema, ItemListResponseSchema } from "../src/http/schemas.ts";
import { freshDir, newCode } from "./access.ts";
import { ownerOf } from "./files.ts";
import { BEFORE_GITHUB } from "./github.ts";
import { launchSeeded } from "./seeded.ts";

const Count = z.array(z.object({ n: z.number() }));

const UNLINKED = { stars: null, repository: null, status: "ready", reason: null } as const;

async function storedItems(owner: APIRequestContext) {
  const listed = ItemListResponseSchema.parse(await (await owner.get("/api/items")).json());

  const details = await Promise.all(
    listed.items
      .toSorted((left, right) => left.id - right.id)
      .map(async ({ id }) =>
        ItemDetailResponseSchema.parse(await (await owner.get(`/api/items/${id}`)).json()),
      ),
  );

  return { listed: listed.items, details: details.map(({ item }) => item) };
}

test("Items stored before the repository table keep every field, show no stars and no repository block, and the table starts empty", async () => {
  test.setTimeout(180_000);
  const code = newCode();
  const instance = launchSeeded(freshDir(), code, BEFORE_GITHUB);

  try {
    const owner = await ownerOf(instance, code, "m".repeat(20));
    const { listed, details } = await storedItems(owner);

    await owner.dispose();

    expect(listed.map(({ stars }) => stars)).toEqual([null, null, null]);
    expect(details).toMatchObject([
      {
        id: 1,
        source: "github",
        kind: "github-repo",
        title: "someone/older",
        author: "someone",
        postText: "An older README.",
        readState: "read",
        fetch: "ok",
        fetchedAt: 1500,
        savedAt: 1111,
        ...UNLINKED,
      },
      {
        id: 2,
        source: "github",
        title: null,
        postText: null,
        readState: "unread",
        fetch: "status",
        savedAt: 2222,
        ...UNLINKED,
      },
      { id: 3, source: "article", title: "An older article", postText: "Older text.", ...UNLINKED },
    ]);

    const tables = instance.query(
      "SELECT (SELECT count(*) FROM github_repos) AS n UNION ALL SELECT count(*) FROM items UNION ALL SELECT count(*) FROM jobs",
      Count,
    );

    expect(tables.map(({ n }) => n)).toEqual([0, 3, 0]);
  } finally {
    instance.stop();
  }
});
