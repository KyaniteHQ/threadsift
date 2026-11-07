import { expect } from "@playwright/test";

import { getItem } from "./api.ts";
import { TAGS, TOPIC, countOf } from "./deletion-seed.ts";
import { expectNoOwnedRows } from "./deletion.ts";
import { answer } from "./filters.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { checkIndex, matches } from "./search.ts";

export async function expectDeletedEverywhere(
  screen: FreshScreen,
  id: number,
  word: string,
): Promise<void> {
  const { request } = screen.context;

  expectNoOwnedRows(screen.fresh, id);
  expect(screen.fresh.listFiles("items/"), "no key under items/ right after the answer").toEqual(
    [],
  );
  expect((await getItem(request, id)).status).toBe(404);
  expect(await matches(request, word)).toEqual([]);
  checkIndex(screen);

  const { counts } = await answer(request, {});
  expect(counts.total).toBe(0);
  expect(counts.topics.map(({ name, count }) => [name, count])).toEqual([[TOPIC, 0]]);
  expect(counts.tags.map(({ name, count }) => `${name}:${count}`).toSorted()).toEqual(
    TAGS.map((name) => `${name}:0`).toSorted(),
  );
  expect(countOf(screen, "SELECT count(*) AS n FROM topics")).toBe(1);
  expect(countOf(screen, "SELECT count(*) AS n FROM tags")).toBe(3);
}
