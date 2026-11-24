import { type Page, expect } from "@playwright/test";

import { PROPOSALS_PAGE, proposalsEmptyLine } from "../web/src/proposals-text.ts";
import { DESKTOP, PHONE, expectNoSidewaysScroll } from "./screen-checks.ts";

export async function proposalsFlow(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: PROPOSALS_PAGE.masthead, exact: true }).click();
  await expect(page).toHaveURL(/\/proposals$/u);
  await expect(page).toHaveTitle("Proposals, Threadsift");
  await expect(page.getByRole("heading", { level: 1, name: PROPOSALS_PAGE.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: PROPOSALS_PAGE.emptyHeading })).toBeVisible();
  await expect(page.getByText(proposalsEmptyLine(false, null))).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Accept|Reject)/u })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: PROPOSALS_PAGE.title })).toBeVisible();

  await page.setViewportSize(PHONE);
  await page.goto("/proposals/");
  await expect(page.getByRole("heading", { name: PROPOSALS_PAGE.emptyHeading })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.setViewportSize(DESKTOP);
}
