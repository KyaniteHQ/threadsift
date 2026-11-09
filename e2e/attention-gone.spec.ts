import { type Page, expect, test } from "@playwright/test";

import { SEARCH_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { cardTitle, pasteOnly } from "./card.ts";
import { WIDE, openItemAt, seedWeather, titleLink } from "./deletion-ui.ts";
import { choice, expectRows, holdRead } from "./filters.ts";
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

test("Escape in the search field while the cleared search is still loading hands the focus to the open Item's row", async () => {
  const { page } = screen;
  const all = seedWeather(screen);
  const second = all[1] ?? 0;

  await openItemAt(page, WIDE, second, 4);

  const search = page.getByRole("searchbox", { name: SEARCH_LABEL });

  await search.fill("no such words");
  await expectRows(page, []);

  const cleared = await holdRead(page, (url) => !url.searchParams.has("q"));

  await search.fill("");
  await cleared.reached;
  await search.focus();
  await page.keyboard.press("Escape");

  cleared.release();
  await cleared.delivered;
  await expectRows(page, all);
  await expect(titleLink(page, second)).toBeFocused();
});
