import { expect, test } from "@playwright/test";

import { DELETE_FAILED, DELETE_PENDING } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import {
  WIDE,
  askAndConfirm,
  cancelButton,
  confirmButton,
  dialog,
  openItemAt,
  seedWeather,
} from "./deletion-ui.ts";
import { ownedRows } from "./deletion.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { row } from "./reader.ts";

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

test("a delete that never answers ends in the failed state after the wait, and the next press deletes", async () => {
  const { page } = screen;
  const [first = 0] = ids;

  await page.clock.install();

  let hangs = true;

  await page.route(/\/api\/items\/\d+$/u, async (route) => {
    if (hangs && route.request().method() === "DELETE") return;

    await route.continue();
  });

  await openItemAt(page, WIDE, first, 4);
  await askAndConfirm(page);
  await expect(confirmButton(page)).toHaveText(DELETE_PENDING);

  await page.clock.fastForward(19_000);
  await expect(confirmButton(page)).toHaveText(DELETE_PENDING);

  await page.clock.fastForward(2000);
  await expect(dialog(page).getByRole("alert")).toHaveText(DELETE_FAILED);
  await expect(confirmButton(page)).toBeEnabled();
  await expect(cancelButton(page)).toBeEnabled();

  hangs = false;
  await confirmButton(page).click();
  await expect(row(page, first)).toHaveCount(0);
  expect(ownedRows(screen.fresh, first)["items"]).toBe(0);
});
