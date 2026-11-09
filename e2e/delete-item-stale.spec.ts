import { expect, test } from "@playwright/test";

import { DELETED } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import {
  WIDE,
  askAndConfirm,
  cancelButton,
  deleteButton,
  dialog,
  holdDelete,
  openItemAt,
  seedWeather,
  titleLink,
} from "./deletion-ui.ts";
import { ownedRows } from "./deletion.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { afterTwoFrames } from "./look.ts";
import { openRow, reader, row } from "./reader.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

const PAST_THE_WAIT_MS = 21_000;

let screen: FreshScreen;
let ids: readonly number[];

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  ids = seedWeather(screen);
});

test.afterEach(async () => {
  await screen.close();
});

test("a delete that finishes after Cancel and another Item was opened removes only the deleted row", async () => {
  const { page } = screen;
  const [first = 0, second = 0] = ids;

  await page.clock.install();
  await openItemAt(page, WIDE, first, 4);

  const held = await holdDelete(page);
  await askAndConfirm(page);
  await held.reached;
  await page.clock.fastForward(PAST_THE_WAIT_MS);
  await expect(cancelButton(page)).toBeEnabled();
  await cancelButton(page).click();
  await expect(dialog(page)).toHaveCount(0);

  await openRow(page, second);

  const focused = await page.evaluateHandle(() => document.activeElement);

  held.release();
  await expect(row(page, first)).toHaveCount(0);
  await afterTwoFrames(page);

  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
  await expect(reader(page)).toBeVisible();
  await expect(titleLink(page, second)).toBeVisible();
  expect(await page.evaluate((element) => element === document.activeElement, focused)).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: DELETED })).toHaveCount(0);
  expect(ownedRows(screen.fresh, first)["items"]).toBe(0);
  expect(ownedRows(screen.fresh, second)["items"]).toBe(1);
});

test("a delete refused after Cancel leaves the dialog closed", async () => {
  const { page } = screen;
  const [first = 0] = ids;

  await page.clock.install();
  await openItemAt(page, WIDE, first, 4);

  const held = await holdDelete(page, "refuse");
  await askAndConfirm(page);
  await held.reached;
  await page.clock.fastForward(PAST_THE_WAIT_MS);
  await expect(cancelButton(page)).toBeEnabled();
  await cancelButton(page).click();
  await expect(dialog(page)).toHaveCount(0);

  held.release();
  await afterTwoFrames(page);

  await expect(dialog(page)).toHaveCount(0);
  await expect(deleteButton(page)).toBeFocused();
  await expect(row(page, first)).toHaveCount(1);
  expect(ownedRows(screen.fresh, first)["items"]).toBe(1);
});

test("a delete that finishes after Cancel while its Item is still open leaves the Reader", async () => {
  const { page } = screen;
  const [first = 0, second = 0] = ids;

  await page.clock.install();
  await openItemAt(page, WIDE, first, 4);

  const held = await holdDelete(page);
  await askAndConfirm(page);
  await held.reached;
  await page.clock.fastForward(PAST_THE_WAIT_MS);
  await cancelButton(page).click();

  held.release();
  await expect(row(page, first)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/u);
  await expect(reader(page)).toHaveCount(0);
  await expect(titleLink(page, second)).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: DELETED })).toBeAttached();
});
