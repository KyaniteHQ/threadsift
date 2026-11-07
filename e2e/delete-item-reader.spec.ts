import { test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { expectDeletedEverywhere } from "./deletion-after.ts";
import { HARD_WORD, expectSeeded, seedHardCase } from "./deletion-seed.ts";
import { WIDE, askAndConfirm, expectLibraryEmptied, openItemAt } from "./deletion-ui.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.describe.configure({ timeout: 360_000 });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

test("deleting from the Reader removes the Item from every table, the index and the file store at once, and keeps its Topic and Tags", async () => {
  const { page } = screen;
  const seeded = await seedHardCase(screen);

  await expectSeeded(screen, seeded);
  await openItemAt(page, WIDE, seeded.id);
  await askAndConfirm(page);
  await expectLibraryEmptied(page);
  await expectDeletedEverywhere(screen, seeded.id, HARD_WORD);
});
