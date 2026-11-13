import { type Page, expect } from "@playwright/test";
import { z } from "zod";

import { FIELDS, LOGIN, SETTINGS, SETUP } from "../web/src/access-text.ts";

const PASSWORD = "a smoke password of fifteen or more";

const SETUP_CODE = z.string().min(16).parse(process.env["SETUP_CODE"]);

export const libraryHeading = (page: Page) =>
  page.getByRole("heading", { level: 1, name: "Threadsift" });

const passwordField = (page: Page) =>
  page.getByLabel(FIELDS.password, { exact: true }).and(page.locator("input"));

export async function setUp(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(SETUP.codeLabel).fill(SETUP_CODE);
  await page.getByRole("button", { name: SETUP.continue }).click();
  await passwordField(page).fill(PASSWORD);
  await page.getByLabel(FIELDS.confirmPassword).fill(PASSWORD);
  await page.getByRole("button", { name: SETUP.create }).click();
  await expect(libraryHeading(page)).toBeVisible();
}

export async function signOutAndIn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: SETTINGS.instanceSettings }).click();
  await page.getByRole("button", { name: SETTINGS.signOut }).click();
  await expect(page).toHaveTitle("Sign in to Threadsift");
  await passwordField(page).fill(PASSWORD);
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(libraryHeading(page)).toBeVisible();
}
