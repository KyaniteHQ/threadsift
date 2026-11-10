import { expect, test } from "@playwright/test";
import { z } from "zod";

import { itemPath } from "../src/core/item-path.ts";
import { MARK_READ } from "../web/src/reader-text.ts";
import { LOAD_FAILED, RETRY_LABEL } from "../web/src/text.ts";
import { head } from "./filters.ts";
import { PAGE_SIZE, idsWhere, isCursorRead, largeLibrary, openLibrary } from "./library-large.ts";
import { bar, reader, row } from "./reader.ts";

const library = largeLibrary();

function openAt(id: number): RegExp {
  return new RegExp(`/items/${id}$`, "u");
}

test("an Item opened by address and marked read while its page is on the way stays read when the page lands, and the counts agree", async () => {
  const { screen, order } = library();
  const { page } = screen;
  const unread = new Set(idsWhere(screen, "read_state = 'unread'"));
  const target = order.slice(55, 99).find((id) => unread.has(id)) ?? 0;
  const gate = Promise.withResolvers<void>();
  const answered = Promise.withResolvers<void>();

  await page.route(isCursorRead, async (route) => {
    const response = await route.fetch();
    answered.resolve();
    await gate.promise;
    await route.fulfill({ response });
  });

  await openLibrary(page, "list", itemPath(target));
  await expect(reader(page)).toBeVisible();
  await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);

  await row(page, order[PAGE_SIZE - 1] ?? 0).scrollIntoViewIfNeeded();
  await answered.promise;

  await bar(page).getByRole("button", { name: MARK_READ }).click();
  await expect(head(page)).toHaveText("3000 items, 2249 unread");

  gate.resolve();
  await expect(page.locator("article.it")).toHaveCount(2 * PAGE_SIZE);
  await expect(row(page, target)).not.toHaveClass(/\bunread\b/u);
  await expect(head(page)).toHaveText("3000 items, 2249 unread");

  const stored = await page.request.get(`/api/items/${target}`);

  const { item } = z
    .object({ item: z.object({ readState: z.string() }) })
    .parse(await stored.json());

  expect(item.readState).toBe("read");
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("j and k from an Item opened by address step to its neighbours in the library order", async () => {
  const { screen, order } = library();
  const { page } = screen;

  await openLibrary(page, "list", itemPath(order[125] ?? 0));
  await expect(reader(page)).toBeVisible();

  await page.keyboard.press("j");
  await expect(page).toHaveURL(openAt(order[126] ?? 0));

  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await expect(page).toHaveURL(openAt(order[124] ?? 0));
});

test("a failed lookup of an Item opened by address keeps the address and offers Try again, and an Item that is gone sends the owner to the library", async () => {
  const { screen, order } = library();
  const { page } = screen;
  const far = order[2500] ?? 0;
  const statusPath = `/api/items/${far}/status`;

  await page.route(
    (url) => url.pathname === statusPath,
    (route) => route.fulfill({ status: 500, body: "{}" }),
  );

  await openLibrary(page, "list", itemPath(far));
  await expect(page.getByRole("alert").filter({ hasText: LOAD_FAILED })).toBeVisible();
  await expect(page).toHaveURL(openAt(far));

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.getByRole("button", { name: RETRY_LABEL }).click();
  await expect(reader(page)).toBeVisible();
  await expect(page).toHaveURL(openAt(far));

  await page.goto(itemPath(99_999_999));
  await expect(page).toHaveURL(/\/$/u);
});
