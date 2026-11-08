import { expect, test } from "@playwright/test";

import { LAST_LIST_KEY } from "../web/src/last-list.ts";
import { newCode, newPassword } from "./access.ts";
import { askAndConfirm, expectLibraryEmptied, openItemAt } from "./deletion-ui.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { autoOpened, emptyLibrary, shiftOf } from "./library-visit.ts";
import { DESKTOP } from "./look.ts";
import { seedRows } from "./reader.ts";

const HINT_LEAVES_LIST_SHIFT = 0.0045;
const SHIFT_PRECISION = 3;

let screen: FreshScreen;

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterAll(async () => {
  await screen.close();
});

test.describe("with one Item that has no Comments", () => {
  let itemId: number;

  test.beforeAll(() => {
    [itemId = 0] = seedRows(screen, [
      { url: "https://example.org/caching", title: "An article about caching", author: "someone" },
    ]);
  });

  test("on a desktop the key hint line leaving the list moves it by a known amount", async () => {
    expect(
      await shiftOf(screen.context, { size: DESKTOP, stored: {}, path: "/", settled: autoOpened }),
      "layout shift from navigation",
    ).toBeCloseTo(HINT_LEAVES_LIST_SHIFT, SHIFT_PRECISION);
  });

  test("deleting the last Item makes the next cold load as steady as any other", async () => {
    const page = await screen.context.newPage();

    try {
      await openItemAt(page, DESKTOP.width, itemId);
      await askAndConfirm(page);
      await expectLibraryEmptied(page);

      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), LAST_LIST_KEY))
        .toBe("empty");
    } finally {
      await page.close();
    }

    expect(
      await shiftOf(screen.context, {
        size: DESKTOP,
        stored: {},
        path: "/",
        settled: emptyLibrary,
      }),
      "layout shift from navigation",
    ).toBe(0);
  });
});
