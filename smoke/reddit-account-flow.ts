import { type Page, expect } from "@playwright/test";

import { SETTINGS } from "../web/src/access-text.ts";
import { REDDIT_ACCOUNT_TEXT } from "../web/src/reddit-account-text.ts";
import { PHONE, expectNoSidewaysScroll } from "./screen-checks.ts";

const SESSION = "a-smoke-session-value.that_is-not-real";

const section = (page: Page) =>
  page.getByRole("region", { name: REDDIT_ACCOUNT_TEXT.sectionTitle });

const button = (page: Page, name: string) =>
  section(page).getByRole("button", { name, exact: true });

const sessionField = (page: Page) => page.getByLabel(REDDIT_ACCOUNT_TEXT.fieldLabel);

export async function redditAccountFlow(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: SETTINGS.instanceSettings }).click();
  await expect(page.getByRole("heading", { name: REDDIT_ACCOUNT_TEXT.sectionTitle })).toBeVisible();
  await expect(page.getByText(REDDIT_ACCOUNT_TEXT.stateNone)).toBeVisible();
  await expect(button(page, REDDIT_ACCOUNT_TEXT.verify)).toHaveAttribute("aria-disabled", "true");

  await button(page, REDDIT_ACCOUNT_TEXT.connect).click();
  await expect(page.getByText(REDDIT_ACCOUNT_TEXT.valueNeeded)).toBeVisible();

  await sessionField(page).fill(SESSION);
  await button(page, REDDIT_ACCOUNT_TEXT.connect).click();
  await expect(page.getByText(REDDIT_ACCOUNT_TEXT.connected)).toBeVisible();
  await expect(page.getByText(REDDIT_ACCOUNT_TEXT.stateConnected)).toBeVisible();
  await expect(sessionField(page)).toHaveAttribute(
    "placeholder",
    REDDIT_ACCOUNT_TEXT.fieldPlaceholder,
  );
  await expect(sessionField(page)).toHaveValue("");

  await page.reload();
  await expect(page.getByText(REDDIT_ACCOUNT_TEXT.stateConnected)).toBeVisible();
  await expect(page.getByText(SESSION)).toHaveCount(0);

  await page.setViewportSize(PHONE);
  await expectNoSidewaysScroll(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  await button(page, REDDIT_ACCOUNT_TEXT.disconnect).click();
  await expect(page.getByText(REDDIT_ACCOUNT_TEXT.disconnected)).toBeVisible();
  await expect(page.getByText(REDDIT_ACCOUNT_TEXT.stateNone)).toBeVisible();
}
