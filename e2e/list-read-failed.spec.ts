import { expect, test } from "@playwright/test";

import { MARK_READ } from "../web/src/reader-text.ts";
import { LOAD_FAILED, RETRY_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { WIDE, openItemAt, seedWeather } from "./deletion-ui.ts";
import { choice, expectRows } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { bar, reader } from "./reader.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

test("a list read that fails after the rows were shown keeps the rows and the open Reader", async () => {
  const { page } = screen;
  const [first = 0, second = 0, , fourth = 0] = seedWeather(screen);

  await openItemAt(page, WIDE, first, 4);
  await choice(page, "Read state", "Unread").click();
  await expectRows(page, [first, second, fourth]);

  const failing = { reads: 0 };

  await page.route(
    (url) => url.pathname === "/api/items",
    async (route) => {
      failing.reads += 1;
      await route.fulfill({ status: 500 });
    },
  );

  await bar(page).getByRole("button", { name: MARK_READ, exact: true }).click();
  await expect.poll(() => failing.reads).toBeGreaterThanOrEqual(2);

  await expect(page.getByText(LOAD_FAILED)).toHaveCount(0);
  await expect(reader(page)).toBeVisible();
  await expectRows(page, [first, second, fourth]);
});

test("a list read for a new filter that fails shows the load error with Retry, and Retry brings the rows back", async () => {
  const { page } = screen;
  const [first = 0, second = 0, , fourth = 0] = seedWeather(screen);

  await openItemAt(page, WIDE, first, 4);

  let failing = true;

  await page.route(
    (url) => url.pathname === "/api/items",
    async (route) => {
      if (failing) await route.fulfill({ status: 500 });
      else await route.continue();
    },
  );

  await choice(page, "Read state", "Unread").click();
  await expect(page.getByText(LOAD_FAILED)).toBeVisible();

  failing = false;
  await page.getByRole("button", { name: RETRY_LABEL }).click();
  await expectRows(page, [first, second, fourth]);
});
