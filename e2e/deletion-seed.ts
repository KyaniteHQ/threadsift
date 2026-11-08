import { expect } from "@playwright/test";
import { z } from "zod";

import { addGithubRepository, expectEveryTableOwns, holdSweeps } from "./deletion.ts";
import { nameFile } from "./files.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { tickNow } from "./ingest.ts";
import { matches } from "./search.ts";
import { FIRST_DIGEST, firstTree, marker, post, postUrl, run } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, savedThread, threadJson } from "./threads.ts";

const FINGERPRINT_WAIT_MS = 150_000;

export const TAGS = ["Alpha lane", "Beta lane", "Gamma lane"] as const;

export const TOPIC = "Archive of deletions";

export const HARD_WORD = marker("kept", "gone");

const Counted = z.array(z.object({ n: z.number() }));

export function countOf(screen: FreshScreen, statement: string): number {
  return screen.fresh.query(statement, Counted)[0]?.n ?? -1;
}

export async function seedHardCase(screen: FreshScreen) {
  const id = `h${run}`;

  const { item } = await savedThread(screen.context.request, {
    url: postUrl(id),
    content: threadJson(post(id, "A body."), firstTree("gone")),
    digest: { ...AUTHORED_DIGEST, ...FIRST_DIGEST, topic: TOPIC, tags: TAGS },
  });

  const keys = [`items/${item.id}/post-1-1.md`, `items/${item.id}/post-1-2.md`] as const;

  screen.fresh.writeFile(keys[0], Buffer.from(`The file the Item names, of ${id}.`));
  nameFile(screen.fresh, item.id, `'${keys[0]}'`);
  addGithubRepository(screen.fresh, item.id);

  await expect
    .poll(
      async () => {
        await tickNow(screen.context.request, screen.fresh);

        return countOf(
          screen,
          `SELECT count(*) AS n FROM search_fingerprints WHERE item_id = ${item.id}`,
        );
      },
      { timeout: FINGERPRINT_WAIT_MS, intervals: [2000] },
    )
    .toBe(1);

  holdSweeps(screen.fresh);
  screen.fresh.writeFile(keys[1], Buffer.from(`The file of an attempt, of ${id}.`));

  return { id: item.id, keys };
}

export async function expectSeeded(
  screen: FreshScreen,
  { id, keys }: Readonly<{ id: number; keys: readonly string[] }>,
): Promise<void> {
  expectEveryTableOwns(screen.fresh, id);
  expect(countOf(screen, `SELECT count(*) AS n FROM item_tags WHERE item_id = ${id}`)).toBe(3);
  expect(screen.fresh.listFiles(`items/${id}/`).map((file) => file.key)).toEqual([...keys]);
  expect(await matches(screen.context.request, HARD_WORD)).toEqual([id]);
}
