import { type Page, expect } from "@playwright/test";
import { z } from "zod";

import { FIELDS, LOGIN, SETTINGS, SETUP } from "../web/src/access-text.ts";
import { openOwnerMenu } from "./screen-checks.ts";

const PASSWORD = "a smoke password of fifteen or more";

const SETUP_CODE = z.string().min(16).parse(process.env["SETUP_CODE"]);

export const libraryHeading = (page: Page) =>
  page.getByRole("heading", { level: 1, name: "Threadsift" });

const passwordField = (page: Page) =>
  page.getByLabel(FIELDS.password, { exact: true }).and(page.locator("input"));

export async function setUp(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(SETUP.codeLabel, { exact: true }).fill(SETUP_CODE);
  await page.getByRole("button", { name: SETUP.continue }).click();
  await passwordField(page).fill(PASSWORD);
  await page.getByLabel(FIELDS.confirmPassword).fill(PASSWORD);
  await page.getByRole("button", { name: SETUP.create }).click();
  await expect(page.getByRole("heading", { level: 1, name: SETUP.startTitle })).toBeVisible();
  await expect(page.getByRole("button", { name: SETUP.startRestore })).toBeVisible();
  await page.getByRole("button", { name: SETUP.startEmpty }).click();
  await expect(libraryHeading(page)).toBeVisible();
}

export async function signOutAndIn(page: Page): Promise<void> {
  await openOwnerMenu(page);
  await page.getByRole("button", { name: SETTINGS.signOut, exact: true }).click();
  await expect(page).toHaveTitle("Sign in to Threadsift");
  expect((await page.request.get("/api/items")).status()).toBe(401);
  await passwordField(page).fill(PASSWORD);
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(libraryHeading(page)).toBeVisible();
}
