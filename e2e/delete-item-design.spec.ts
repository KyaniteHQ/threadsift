import { expect, test } from "@playwright/test";

import { DELETE_FAILED } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import { ask, cancelButton, confirmButton, deleteButton, dialog } from "./deletion-ui.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { attachScreenshot, storeSettings, viewportAt } from "./look.ts";
import { paragraphs, reader, seedRows } from "./reader.ts";

let screen: FreshScreen;
let id: number;

test.describe.configure({ timeout: 480_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  [id = 0] = seedRows(screen, [
    {
      url: "https://example.com/delete-design",
      title: "An Item to delete",
      postText: paragraphs(4, "Delete design"),
    },
  ]);

  screen.fresh.sql(
    "CREATE TRIGGER refuse_delete BEFORE DELETE ON items BEGIN SELECT RAISE(ABORT, 'refused'); END",
  );
});

test.afterAll(async () => {
  await screen.close();
});

test("the Reader bar with Delete, the open dialog and the dialog with its error line break no design rule in Light, Dark and Sepia at 390, 600, 1440 and 1920 px", async () => {
  const { page } = screen;
  const info = test.info();

  for (const theme of THEMES) {
    for (const [width, bands] of BANDS_AT_WIDTH) {
      const where = `${theme} at ${width}px`;
      await viewportAt(page, width);
      await storeSettings(page, { theme }, `/items/${id}`);
      await resize(page, width, bands);
      await expect(reader(page)).toBeVisible();
      await expect(deleteButton(page)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectNoViolations(page, `the bar with Delete, ${where}`);
      await attachScreenshot(page, info, `delete-bar-${theme}-${width}`);

      await ask(page);
      await expectNoViolations(page, `the open dialog, ${where}`);
      await attachScreenshot(page, info, `delete-dialog-${theme}-${width}`);

      await confirmButton(page).click();
      await expect(dialog(page).getByRole("alert")).toHaveText(DELETE_FAILED);
      await expectNoViolations(page, `the dialog with its error line, ${where}`);
      await attachScreenshot(page, info, `delete-error-${theme}-${width}`);

      await cancelButton(page).click();
      await expect(dialog(page)).toHaveCount(0);
    }
  }
});
