import { expect, test } from "@playwright/test";

import { ItemDetailResponseSchema } from "../src/http/schemas.ts";
import { MARK_READ, MARK_UNREAD } from "../web/src/reader-text.ts";
import { createToken } from "./access-helpers.ts";
import { bearer, newCode, newPassword } from "./access.ts";
import { head, choice, expectRows } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP } from "./look.ts";
import { bar, openLibrary, openRow, readStateOf, row, seedRows } from "./reader.ts";

let screen: FreshScreen;
let ids: readonly number[];

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  ids = seedRows(screen, [
    { url: "https://example.com/one", title: "Rain on the roof" },
    { url: "https://example.com/two", title: "Wind in the chimney" },
    { url: "https://example.com/three", title: "Snow on the sill", read: true },
    { url: "https://example.com/four", title: "Fog over the fields" },
  ]);
});

test.afterEach(async () => {
  await screen.close();
});

test("m and the bar button mark the open Item read and unread, and the row, the unread count and the Read state counts follow", async () => {
  const { page } = screen;
  const [first, second] = ids;
  await openLibrary(page, DESKTOP.width, "/", 4);
  await expect(head(page)).toHaveText("4 items, 3 unread");
  await openRow(page, first ?? 0);
  await expect(row(page, first ?? 0)).toHaveClass(/\bunread\b/u);

  await page.keyboard.press("m");
  await expect(row(page, first ?? 0)).not.toHaveClass(/\bunread\b/u);
  await expect(head(page)).toHaveText("4 items, 2 unread");
  await expect(choice(page, "Read state", "Unread")).toContainText("2");
  await expect(choice(page, "Read state", "Read")).toContainText("2");
  await expect(bar(page).getByRole("button", { name: MARK_UNREAD })).toBeVisible();
  expect(await readStateOf(page, first ?? 0)).toBe("read");

  await bar(page).getByRole("button", { name: MARK_UNREAD }).click();
  await expect(row(page, first ?? 0)).toHaveClass(/\bunread\b/u);
  await expect(head(page)).toHaveText("4 items, 3 unread");
  await expect(bar(page).getByRole("button", { name: MARK_READ })).toBeVisible();

  await row(page, second ?? 0)
    .locator(".it-dot")
    .click();
  await expect(head(page)).toHaveText("4 items, 2 unread");
  expect(await readStateOf(page, second ?? 0)).toBe("read");

  await page.reload();
  await expect(head(page)).toHaveText("4 items, 2 unread");
  await expect(row(page, second ?? 0)).not.toHaveClass(/\bunread\b/u);
});

test("with the Unread filter on, a marked row stays until the next list read and then leaves", async () => {
  const { page } = screen;
  const [first, second] = ids;
  await openLibrary(page, DESKTOP.width, "/", 4);
  await choice(page, "Read state", "Unread").click();
  await expectRows(page, [first ?? 0, second ?? 0, ids[3] ?? 0]);
  await openRow(page, first ?? 0);

  await page.keyboard.press("m");
  await expect(choice(page, "Read state", "Unread")).toContainText("2");
  await expect(row(page, first ?? 0)).toBeVisible();
  await expect(row(page, first ?? 0)).not.toHaveClass(/\bunread\b/u);
  await expect(head(page)).toHaveText("3 of 4 items");

  await choice(page, "Read state", "All").click();
  await choice(page, "Read state", "Unread").click();
  await expectRows(page, [second ?? 0, ids[3] ?? 0]);
});

test("an agent token gets 403 on the read-state route and the state stays, while the owner changes only the Read state", async () => {
  const { request } = screen.context;
  const [first] = ids;
  const target = first ?? 0;

  const before = ItemDetailResponseSchema.parse(
    await (await request.get(`/api/items/${target}`)).json(),
  );

  const { value } = await createToken(request, "Read state proof");

  const refused = await request.put(`/api/items/${target}/read-state`, {
    data: { readState: "read" },
    headers: bearer(value),
  });

  expect(refused.status()).toBe(403);
  expect(await readStateOf(screen.page, target)).toBe("unread");

  const invalid = await request.put(`/api/items/${target}/read-state`, {
    data: { readState: "archived" },
  });

  expect(invalid.status()).toBe(400);

  const missing = await request.put("/api/items/999999/read-state", {
    data: { readState: "read" },
  });

  expect(missing.status()).toBe(404);

  const accepted = await request.put(`/api/items/${target}/read-state`, {
    data: { readState: "read" },
  });

  expect(accepted.status()).toBe(200);

  const after = ItemDetailResponseSchema.parse(
    await (await request.get(`/api/items/${target}`)).json(),
  );

  expect({ ...after.item, readState: "unread" }).toEqual(before.item);
  expect(after.item.readState).toBe("read");
});
