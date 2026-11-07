import { expect, test } from "@playwright/test";

import { LOGIN } from "../web/src/access-text.ts";
import { DELETED, DELETE_FAILED, DELETE_PENDING } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import { agentHeaders } from "./catalog.ts";
import {
  PHONE,
  WIDE,
  ask,
  askAndConfirm,
  cancelButton,
  confirmButton,
  deleteButton,
  dialog,
  holdDelete,
  openItemAt,
  seedWeather,
  titleLink,
} from "./deletion-ui.ts";
import { ownedRows } from "./deletion.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { pasteField } from "./links.ts";
import { openLibrary, openRow, reader, row } from "./reader.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;
let ids: readonly number[];

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  ids = seedWeather(screen);
});

test.afterEach(async () => {
  await screen.close();
});

test("Cancel and Escape keep the Item and return focus to Delete, Tab stays in the dialog, and a pending delete cannot be pressed twice or cancelled", async () => {
  const { page } = screen;
  const [, second = 0, third = 0] = ids;
  await openItemAt(page, WIDE, second, 4);

  await ask(page);
  await expect(cancelButton(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirmButton(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancelButton(page)).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirmButton(page)).toBeFocused();

  await cancelButton(page).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(deleteButton(page)).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));

  await ask(page);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(deleteButton(page)).toBeFocused();
  await expect(reader(page)).toBeVisible();
  expect(ownedRows(screen.fresh, second)["items"]).toBe(1);

  const held = await holdDelete(page);
  await askAndConfirm(page);
  await held.reached;
  await expect(confirmButton(page)).toBeDisabled();
  await expect(confirmButton(page)).toHaveText(DELETE_PENDING);
  await expect(cancelButton(page)).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeVisible();
  await expect(confirmButton(page)).toBeDisabled();

  held.release();
  await expect(row(page, second)).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/u);
  await expect(titleLink(page, third)).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: DELETED })).toBeAttached();
  expect(ownedRows(screen.fresh, second)["items"]).toBe(0);
});

test("after a delete focus lands on the next row's title, the previous one when the last row went, and on the paste field when none is left", async () => {
  const { page } = screen;
  const [first = 0, second = 0, third = 0, fourth = 0] = ids;
  await openLibrary(page, WIDE, "/", 4);

  await openRow(page, fourth);
  await askAndConfirm(page);
  await expect(row(page, fourth)).toHaveCount(0);
  await expect(titleLink(page, third)).toBeFocused();

  await openRow(page, first);
  await askAndConfirm(page);
  await expect(row(page, first)).toHaveCount(0);
  await expect(titleLink(page, second)).toBeFocused();

  for (const id of [second, third]) {
    await openRow(page, id);
    await askAndConfirm(page);
    await expect(row(page, id)).toHaveCount(0);
  }

  await expect(page.locator("article.it")).toHaveCount(0);
  await expect(pasteField(page)).toBeFocused();
});

test("at 390px the Reader covers the list, and focus lands on the next row's title once the list is live again", async () => {
  const { page } = screen;
  const [first = 0, second = 0] = ids;
  await openItemAt(page, PHONE, first, 4);
  await expect(page.locator(".bg")).toHaveAttribute("inert", "");

  await askAndConfirm(page);
  await expect(reader(page)).toHaveCount(0);
  await expect(row(page, first)).toHaveCount(0);
  await expect(titleLink(page, second)).toBeFocused();
  await expect(page.locator(".bg")).not.toHaveAttribute("inert", "");
});

test("a failed delete keeps the dialog open with an error line and every row, and the same press succeeds once the cause is gone", async () => {
  const { page } = screen;
  const [first = 0] = ids;
  await openItemAt(page, WIDE, first, 4);
  const before = ownedRows(screen.fresh, first);

  screen.fresh.sql(
    "CREATE TRIGGER refuse_delete BEFORE DELETE ON items BEGIN SELECT RAISE(ABORT, 'refused'); END",
  );

  await askAndConfirm(page);
  await expect(dialog(page).getByRole("alert")).toHaveText(DELETE_FAILED);
  await expect(confirmButton(page)).toBeEnabled();
  await expect(cancelButton(page)).toBeEnabled();
  await expect(row(page, first)).toHaveCount(1);
  expect(ownedRows(screen.fresh, first), "the failed batch changed nothing").toEqual(before);

  screen.fresh.sql("DROP TRIGGER refuse_delete");
  await confirmButton(page).click();
  await expect(row(page, first)).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(0);
  expect(ownedRows(screen.fresh, first)["items"]).toBe(0);
});

test("a dialog left open while the Item is deleted elsewhere closes the Reader on confirm, because a 404 counts as deleted", async () => {
  const { page } = screen;
  const [first = 0, second = 0] = ids;
  await openItemAt(page, WIDE, first, 4);
  await ask(page);

  const gone = await screen.context.request.delete(`/api/items/${first}`, {
    headers: await agentHeaders(screen),
  });

  expect(gone.status()).toBe(204);
  await confirmButton(page).click();
  await expect(row(page, first)).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(0);
  await expect(titleLink(page, second)).toBeFocused();
});

test("a session that ended while the dialog was open sends the app to the sign-in screen", async () => {
  const { page } = screen;
  const [first = 0] = ids;
  await openItemAt(page, WIDE, first, 4);
  await ask(page);

  expect((await screen.context.request.post("/api/logout", { data: {} })).status()).toBe(204);
  await confirmButton(page).click();
  await expect(page.getByRole("heading", { name: LOGIN.heading })).toBeVisible();
  expect(ownedRows(screen.fresh, first)["items"]).toBe(1);
});
