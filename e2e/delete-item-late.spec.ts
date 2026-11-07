import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { WIDE, askAndConfirm, openItemAt } from "./deletion-ui.ts";
import { ownedRows } from "./deletion.ts";
import { choice, expectRows, holdRead } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { afterTwoFrames } from "./look.ts";
import { row, seedRows } from "./reader.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;
let ids: readonly number[];

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

function firstOnly(wanted: (url: URL) => boolean): (url: URL) => boolean {
  let taken = false;

  return (url) => {
    if (taken || !wanted(url)) return false;

    taken = true;

    return true;
  };
}

test("a list answer that started before the delete never brings the row or the old counts back", async () => {
  const { page } = screen;
  const [first = 0, second = 0, , fourth = 0] = ids;
  await openItemAt(page, WIDE, first, 4);

  const older = await holdRead(
    page,
    firstOnly((url) => url.searchParams.get("read") === "unread"),
  );

  await choice(page, "Read state", "Unread").click();
  await older.reached;

  await askAndConfirm(page);
  await expect(row(page, first)).toHaveCount(0);

  older.release();
  await older.delivered;
  await afterTwoFrames(page);

  await expectRows(page, [second, fourth]);
  await expect(choice(page, "Read state", "Unread")).toContainText("2");
  await expect(choice(page, "Read state", "Read")).toContainText("1");
  expect(ownedRows(screen.fresh, first)["items"]).toBe(0);
});

test("a Read state answer that arrives after the delete does not bring the row back", async () => {
  const { page } = screen;
  const [first = 0, second = 0, third = 0, fourth = 0] = ids;
  await openItemAt(page, WIDE, first, 4);

  const gate = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();

  await page.route(/\/api\/items\/\d+\/read-state$/u, async (route) => {
    const response = await route.fetch();
    reached.resolve();
    await gate.promise;
    await route.fulfill({ response });
  });

  await page.keyboard.press("m");
  await reached.promise;
  await askAndConfirm(page);
  await expect(row(page, first)).toHaveCount(0);

  gate.resolve();
  await afterTwoFrames(page);

  await expectRows(page, [second, third, fourth]);
  expect(ownedRows(screen.fresh, first)["items"]).toBe(0);
});
