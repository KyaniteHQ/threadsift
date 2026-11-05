import { type Page, expect } from "@playwright/test";

import { FIELDS, SETUP } from "../web/src/access-text.ts";

export function codeField(page: Page) {
  return page.getByLabel(SETUP.codeLabel);
}

export function passwordField(page: Page) {
  return page.getByLabel(FIELDS.password, { exact: true });
}

export function confirmField(page: Page) {
  return page.getByLabel(FIELDS.confirmPassword);
}

export async function enterCode(page: Page, code: string): Promise<void> {
  await codeField(page).fill(code);
  await page.getByRole("button", { name: SETUP.continue }).click();
}

export async function choosePassword(page: Page, password: string): Promise<void> {
  await expect(page.getByRole("heading", { name: SETUP.passwordTitle })).toBeVisible();
  await passwordField(page).fill(password);
  await confirmField(page).fill(password);
  await page.getByRole("button", { name: SETUP.create }).click();
}

export async function setUpInBrowser(page: Page, code: string, password: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: SETUP.codeTitle })).toBeVisible();
  await enterCode(page, code);
  await choosePassword(page, password);
  await expect(page.getByRole("heading", { level: 1, name: "Threadsift" })).toBeVisible();
}
