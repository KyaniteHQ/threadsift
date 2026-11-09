import { expect, test } from "@playwright/test";

import { NOTICES } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { pasteCard, pasteField } from "./links.ts";
import { openPanel } from "./look.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

async function leaveAndReturn(): Promise<void> {
  const { page } = screen;
  const panel = await openPanel(page);

  await panel.getByRole("link", { name: "Instance settings" }).click();
  await expect(page).toHaveURL(/\/settings$/u);
  await page.goBack();
  await expect(pasteField(page)).toBeVisible();
}

test("a shared link that was dismissed does not fill the paste box again after a visit to Settings", async () => {
  const { page } = screen;
  const link = "not a link at all";

  await page.goto(`/?link=${encodeURIComponent(link)}&notice=invalid`);
  await expect(pasteField(page)).toHaveValue(link);
  await expect(pasteCard(page)).toContainText(NOTICES.invalid.text);

  await pasteCard(page).getByRole("button", { name: "Dismiss" }).click();
  await expect(pasteCard(page)).toBeHidden();

  await leaveAndReturn();

  await expect(pasteField(page)).toHaveValue("");
  await expect(pasteCard(page)).toBeHidden();
});
