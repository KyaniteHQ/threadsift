import { expect, test } from "@playwright/test";

import { SEARCH_LABEL } from "../web/src/text.ts";
import { rowsInOrder } from "./filters.ts";
import {
  PAGE_SIZE,
  idsWhere,
  largeLibrary,
  openLibrary,
  scrollPast,
  scrollUntil,
} from "./library-large.ts";
import { pasteField } from "./links.ts";
import { row } from "./reader.ts";

const library = largeLibrary();

test("a reload of a filtered list drops a loaded Item that stopped matching, shows one that began to match, and the later pages stay right", async () => {
  const { screen, order } = library();
  const { page } = screen;
  await openLibrary(page, "list");

  await scrollPast(page, 2 * PAGE_SIZE);
  await page.getByRole("searchbox", { name: SEARCH_LABEL }).fill("alpha");
  const before = idsWhere(screen, "title LIKE '% alpha'");

  await expect
    .poll(async () => (await rowsInOrder(page)).join(","))
    .toBe(before.slice(0, PAGE_SIZE).join(","));

  await scrollPast(page, 2 * PAGE_SIZE);
  const loaded = await rowsInOrder(page);
  const stale = loaded[75] ?? 0;
  const newly = order[order.indexOf(loaded[40] ?? 0) + 1] ?? 0;
  expect(before).not.toContain(newly);

  screen.fresh.sql(
    [
      `UPDATE items SET title = 'Moved out ' || id || ' about beta' WHERE id = ${stale}`,
      `UPDATE search_parts SET body = 'Moved out ' || item_id || ' about beta' WHERE item_id = ${stale} AND kind = 'title'`,
      `UPDATE items SET title = 'Moved in ' || id || ' about alpha' WHERE id = ${newly}`,
      `UPDATE search_parts SET body = 'Moved in ' || item_id || ' about alpha' WHERE item_id = ${newly} AND kind = 'title'`,
    ].join("; "),
  );

  const after = idsWhere(screen, "title LIKE '% alpha'");
  expect(after).toContain(newly);
  expect(after).not.toContain(stale);

  await pasteField(page).fill(`https://example.com/filtered-reload-${Date.now()}`);
  await pasteField(page).press("Enter");

  await expect(row(page, stale)).toHaveCount(0);
  await expect(row(page, newly)).toHaveCount(1);

  await scrollUntil(page, after.length);
  expect(await rowsInOrder(page)).toEqual(after);
});
