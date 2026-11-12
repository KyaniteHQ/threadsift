import { type Page, expect } from "@playwright/test";

import { SETTINGS } from "../web/src/access-text.ts";
import { GROK_BOT_TEXT } from "../web/src/grok-bot-text.ts";
import { PHONE, expectNoSidewaysScroll } from "./screen-checks.ts";

const ADDRESS = "https://api2.cursor.sh/automations/webhook/00000000-0000-4000-8000-000000000000";

const OTHER_ADDRESS = "https://example.com/automations/webhook/other";

const KEY = "a-smoke-routine-key-of-one-line";

const section = (page: Page) => page.getByRole("region", { name: GROK_BOT_TEXT.sectionTitle });

const button = (page: Page, name: string) =>
  section(page).getByRole("button", { name, exact: true });

const addressField = (page: Page) => page.getByLabel(GROK_BOT_TEXT.addressLabel);

const keyField = (page: Page) => page.getByLabel(GROK_BOT_TEXT.keyLabel);

async function openSection(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: SETTINGS.instanceSettings }).click();
  await expect(page.getByRole("heading", { name: GROK_BOT_TEXT.sectionTitle })).toBeVisible();
}

export async function grokBotFlow(page: Page): Promise<void> {
  await openSection(page);
  await expect(page.getByText(GROK_BOT_TEXT.stateNone)).toBeVisible();
  await expect(button(page, GROK_BOT_TEXT.test)).toHaveAttribute("aria-disabled", "true");

  await addressField(page).fill(ADDRESS);
  await button(page, GROK_BOT_TEXT.save).click();
  await expect(page.getByText(GROK_BOT_TEXT.keyNeeded)).toBeVisible();

  await keyField(page).fill(KEY);
  await button(page, GROK_BOT_TEXT.save).click();
  await expect(page.getByText(GROK_BOT_TEXT.saved)).toBeVisible();
  await expect(page.getByText(GROK_BOT_TEXT.stateSaved)).toBeVisible();
  await expect(keyField(page)).toHaveAttribute("placeholder", GROK_BOT_TEXT.keySavedPlaceholder);
  await expect(keyField(page)).toHaveValue("");

  await page.reload();
  await expect(addressField(page)).toHaveValue(ADDRESS);
  await expect(page.getByText(KEY)).toHaveCount(0);

  await addressField(page).fill(OTHER_ADDRESS);
  await expect(page.getByText(GROK_BOT_TEXT.keyNewAddress)).toBeVisible();

  await page.setViewportSize(PHONE);
  await expectNoSidewaysScroll(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  await button(page, GROK_BOT_TEXT.remove).click();
  await expect(page.getByText(GROK_BOT_TEXT.removed)).toBeVisible();
  await expect(page.getByText(GROK_BOT_TEXT.stateNone)).toBeVisible();
  await expect(addressField(page)).toHaveValue("");
}
