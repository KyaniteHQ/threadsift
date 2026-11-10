import { expect, test } from "@playwright/test";

import { NO_RESULTS } from "../web/src/text.ts";
import { rowsInOrder } from "./filters.ts";
import { PAGE_SIZE, largeLibrary, openLibrary, scrollUntil } from "./library-large.ts";

const library = largeLibrary();

test("when the newest 50 Items are skipped as contradictory, the list goes on to the later pages instead of saying nothing matches", async () => {
  const { screen, order } = library();
  const { page } = screen;

  screen.fresh.sql(
    [
      "DROP TRIGGER items_status_reason_update",
      `UPDATE items SET status = 'failed', reason = NULL WHERE id IN (${order.slice(0, PAGE_SIZE).join(", ")})`,
    ].join("; "),
  );

  await openLibrary(page, "list");
  await expect(page.locator("article.it")).not.toHaveCount(0);
  await expect(page.getByText(NO_RESULTS)).toHaveCount(0);

  await scrollUntil(page, order.length - PAGE_SIZE);
  expect(await rowsInOrder(page)).toEqual(order.slice(PAGE_SIZE));
});
