import { expect, test } from "@playwright/test";

import { READER_STALE } from "../web/src/reader-text.ts";
import { RETRY_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { pasteOnly } from "./card.ts";
import { WIDE } from "./deletion-ui.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { deferJobs } from "./ingest.ts";
import { openLibrary, openRow, reader, seedRows } from "./reader.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

const URL_OF = "https://example.com/stale-reader";
const OLD_TEXT = "The earlier body of this Item.";

test("a Reader whose refreshed Item could not be read again says the text is from earlier, and Try again reads it", async () => {
  const { page } = screen;

  const [id = 0] = seedRows(screen, [
    { url: URL_OF, title: "Stale reader", postText: OLD_TEXT, fetchResult: "ok" },
  ]);

  await openLibrary(page, WIDE, "/", 1);
  await openRow(page, id);
  await expect(reader(page)).toContainText(OLD_TEXT);
  await expect(reader(page)).not.toContainText(READER_STALE);

  let failing = true;

  await page.route(
    (url) => url.pathname === `/api/items/${id}`,
    async (route) => {
      if (failing) await route.fulfill({ status: 500 });
      else await route.continue();
    },
  );

  const restore = deferJobs(screen.fresh, "fetch");

  try {
    await pasteOnly(page, URL_OF);
  } finally {
    restore();
  }

  await expect(reader(page)).toContainText(READER_STALE);
  await expect(reader(page)).toContainText(OLD_TEXT);

  failing = false;
  await reader(page).getByRole("button", { name: RETRY_LABEL }).click();
  await expect(reader(page)).toContainText(OLD_TEXT);
  await expect(reader(page)).not.toContainText(READER_STALE);
});
