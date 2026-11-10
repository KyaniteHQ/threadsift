import { type Page, expect, test } from "@playwright/test";
import { z } from "zod";

import { FIELDS, LOGIN, SETTINGS, SETUP } from "../web/src/access-text.ts";
import { ADD_LABEL, PASTE_LABEL } from "../web/src/text.ts";

const PASSWORD = "a smoke password of fifteen or more";

const X_LINK = "https://x.com/someone/status/1234567890";

const X_ROW = "x.com/i/status/1234567890";

const ARTICLE_LINK = "https://example.com/guides/backing-up-sqlite";

const ARTICLE_TITLE = "Backing up SQLite";

const SENTENCE =
  "Copying the database file while the writer is busy can tear a page, so take the copy with the online backup command instead.";

const ARTICLE_TEXT = Array.from({ length: 8 }, () => SENTENCE).join("\n\n");

const SETUP_CODE = z.string().min(16).parse(process.env["SETUP_CODE"]);

const libraryHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Threadsift" });

const passwordField = (page: Page) =>
  page.getByLabel(FIELDS.password, { exact: true }).and(page.locator("input"));

async function setUp(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(SETUP.codeLabel).fill(SETUP_CODE);
  await page.getByRole("button", { name: SETUP.continue }).click();
  await passwordField(page).fill(PASSWORD);
  await page.getByLabel(FIELDS.confirmPassword).fill(PASSWORD);
  await page.getByRole("button", { name: SETUP.create }).click();
  await expect(libraryHeading(page)).toBeVisible();
}

async function signOutAndIn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: SETTINGS.instanceSettings }).click();
  await page.getByRole("button", { name: SETTINGS.signOut }).click();
  await expect(page).toHaveTitle("Sign in to Threadsift");
  await passwordField(page).fill(PASSWORD);
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(libraryHeading(page)).toBeVisible();
}

async function pasteXLink(page: Page): Promise<void> {
  const row = page.locator("article.it.it-link-only");

  await page.getByRole("textbox", { name: PASTE_LABEL }).fill(X_LINK);
  await page.getByRole("button", { name: ADD_LABEL }).click();
  await expect(row).toContainText(X_ROW);
  await page.reload();
  await expect(row).toContainText(X_ROW);
}

async function readSavedPage(page: Page): Promise<void> {
  const saved = await page.request.post("/api/items", {
    data: {
      url: ARTICLE_LINK,
      page: { markdown: ARTICLE_TEXT, title: ARTICLE_TITLE, author: "Ada Example" },
    },
  });

  expect(saved.status()).toBe(201);
  await page.reload();
  await page
    .locator("article.it")
    .filter({ hasText: ARTICLE_TITLE })
    .getByRole("link")
    .first()
    .click();
  await expect(page.locator(".reader")).toContainText(SENTENCE);
}

test("a new Instance is set up, signed out of and into again, keeps a pasted X link across a reload, and opens a saved page in the Reader", async ({
  page,
}) => {
  await test.step("set up the owner with the setup code", () => setUp(page));
  await test.step("sign out and sign in again", () => signOutAndIn(page));
  await test.step("paste an X link and find its Link-only row after a reload", () =>
    pasteXLink(page));
  await test.step("save a page through the API and read its text in the Reader", () =>
    readSavedPage(page));
});
