import { type Browser, type Page, expect } from "@playwright/test";

import { PROPOSALS_PAGE, proposalsEmptyLine } from "../web/src/proposals-text.ts";
import { PHONE, expectNoSidewaysScroll } from "./screen-checks.ts";

async function expectEmptyWithoutProvider(page: Page): Promise<void> {
  await expect(page).toHaveTitle("Proposals, Threadsift");
  await expect(page.getByRole("heading", { level: 1, name: PROPOSALS_PAGE.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: PROPOSALS_PAGE.emptyHeading })).toBeVisible();
  await expect(page.getByText(proposalsEmptyLine(false, null))).toBeVisible();
  await expect(page.getByRole("button", { name: /^Reject/u })).toHaveCount(0);
}

export async function proposalsFlow(page: Page, browser: Browser): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: PROPOSALS_PAGE.masthead, exact: true }).click();
  await expect(page).toHaveURL(/\/proposals$/u);
  await expectEmptyWithoutProvider(page);

  await page.reload();
  await expectEmptyWithoutProvider(page);

  await page.setViewportSize(PHONE);
  await page.goto("/proposals");
  await expectEmptyWithoutProvider(page);
  await expectNoSidewaysScroll(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  const signedOut = await browser.newContext();

  try {
    const visitor = await signedOut.newPage();

    await visitor.goto("/proposals");
    await expect(visitor).toHaveTitle("Sign in to Threadsift");
  } finally {
    await signedOut.close();
  }
}
