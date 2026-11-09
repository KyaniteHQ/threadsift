import { type Page, expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { cardTitle, pasteOnly } from "./card.ts";
import { choice, expectRows } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { deferJobs } from "./ingest.ts";
import { DESKTOP } from "./look.ts";
import { openLibrary, row, seedRows } from "./reader.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

function paneScroll(page: Page, id: number): Promise<number> {
  return row(page, id).evaluate((element) => {
    for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
      const { overflowY } = getComputedStyle(parent);

      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        parent.scrollHeight > parent.clientHeight
      )
        return parent.scrollTop;
    }

    return -1;
  });
}

test("a Paste of an Item that the filters hide does not scroll to its row when the filters are cleared later", async () => {
  const { page } = screen;
  const hidden = "https://example.org/hidden-by-source";

  const ids = seedRows(screen, [
    ...Array.from({ length: 40 }, (_, index) => ({
      url: `https://example.com/essay-${index}`,
      title: `Essay ${index}`,
    })),
    { url: hidden, title: "Hidden by Source", source: "other" as const, kind: "link" },
  ]);

  const [newest = 0] = ids;
  const last = ids.at(-1) ?? 0;

  await openLibrary(page, DESKTOP.width, "/", 41);
  await choice(page, "Source", "Article").click();
  await expect(row(page, last)).toHaveCount(0);

  const restore = deferJobs(screen.fresh, "fetch");

  try {
    await pasteOnly(page, hidden);
    await expect(cardTitle(page)).toBeVisible();
  } finally {
    restore();
  }

  await choice(page, "Source", "Article").focus();
  await page.keyboard.press("Enter");
  await expect(row(page, last)).toBeVisible();
  await expectRows(page, ids);
  expect(await paneScroll(page, newest)).toBe(0);
});
