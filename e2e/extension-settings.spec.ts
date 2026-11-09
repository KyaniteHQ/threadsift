import { type Page, expect, test } from "@playwright/test";

import { TEXT } from "../extension/lib/text.ts";
import { ESSAY } from "./articles.ts";
import { configuredExtensionSession } from "./extension-session.ts";
import { ACTION_TEXT } from "./extension.ts";

test.describe.configure({ timeout: 240_000 });

const session = configuredExtensionSession();

async function saveFromSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: TEXT.saveSettings }).click();
  await expect(page.getByRole("status")).toHaveText(TEXT.settingsSaved);
}

test("the settings page never shows the saved token, and saving without a new one keeps it", async () => {
  const { library, extension, tokenValue } = session();
  const settings = await extension.settings();

  await expect(settings.getByLabel(TEXT.addressLabel)).toHaveValue(library.instance.url);
  await expect(settings.getByLabel(TEXT.tokenLabel)).toHaveValue("");
  await expect(settings.getByText(TEXT.tokenKept)).toBeVisible();
  expect(await settings.content(), "the page holds the saved token").not.toContain(tokenValue);

  await saveFromSettings(settings);
  await settings.close();

  const popup = await extension.press(await extension.tab(ESSAY));

  await expect.poll(() => popup.status()).toBe(ACTION_TEXT.saved);
});

test("a token typed in the settings replaces the saved one", async () => {
  const { extension } = session();
  const settings = await extension.settings();

  await settings.getByLabel(TEXT.tokenLabel).fill("tsa_not-a-token");
  await saveFromSettings(settings);
  await expect(settings.getByLabel(TEXT.tokenLabel)).toHaveValue("");
  await settings.close();

  const popup = await extension.press(await extension.tab(ESSAY));

  await expect.poll(() => popup.status()).toBe(ACTION_TEXT.tokenRefused);
});
